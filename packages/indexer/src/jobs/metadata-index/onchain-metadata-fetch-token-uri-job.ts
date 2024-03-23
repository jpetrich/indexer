import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { onchainMetadataProcessTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-process-token-uri-job";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { hasCustomHandler } from "@/metadata/custom";
import { redis } from "@/common/redis";
import { Tokens } from "@/models/tokens";

export default class OnchainMetadataFetchTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-fetch-uri-queue";
  maxRetries = 3;
  concurrency = 3;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process() {
    const count = 50; // Default number of tokens to fetch

    // Get the onchain tokens from the list
    const pendingRefreshTokens = new PendingRefreshTokens("onchain");
    let fetchTokens = await pendingRefreshTokens.get(count);

    // if the token has custom metadata, don't fetch it and instead process it
    const customTokens = fetchTokens.filter((token) => hasCustomHandler(token.contract));
    if (customTokens.length) {
      await onchainMetadataProcessTokenUriJob.addToQueueBulk(
        customTokens.map((token) => ({
          contract: token.contract,
          tokenId: token.tokenId,
          uri: "",
        }))
      );
    }

    // Filter out custom tokens
    fetchTokens = fetchTokens.filter((token) => !hasCustomHandler(token.contract));

    // If no more tokens
    if (_.isEmpty(fetchTokens)) {
      return;
    }

    // Filter tokens for which the token URI already known
    const tokensUri = await Tokens.getMultipleContractsTokensUri(fetchTokens);
    const filteredFetchTokens = _.filter(fetchTokens, function (token) {
      return !_.some(tokensUri, {
        contract: token.contract,
        tokenId: token.tokenId,
      });
    });

    logger.info(
      this.queueName,
      `fetchTokens = ${JSON.stringify(fetchTokens)}, tokensUri = ${JSON.stringify(
        tokensUri
      )}, filteredFetchTokens=${JSON.stringify(filteredFetchTokens)}`
    );

    let results: {
      contract: string;
      tokenId: string;
      uri: string | null;
      error?: string;
    }[] = [];

    if (!_.isEmpty(filteredFetchTokens)) {
      try {
        results = await onchainMetadataProvider._getTokensMetadataUri(filteredFetchTokens);
        logger.info(this.queueName, `results = ${JSON.stringify(results)}`);
      } catch (e) {
        if (e instanceof RequestWasThrottledError) {
          logger.warn(
            this.queueName,
            `Request was throttled. fetchUriTokenCount=${filteredFetchTokens.length}`
          );

          await pendingRefreshTokens.add(filteredFetchTokens, true);

          // Add to queue again with a delay from the error
          await this.addToQueue(e.delay);
          return;
        }

        logger.error(
          this.queueName,
          `Error. fetchUriTokenCount=${filteredFetchTokens.length}, tokens=${JSON.stringify(
            filteredFetchTokens
          )}, error=${JSON.stringify(e)}`
        );
      }
    }

    const tokensToProcess: {
      contract: string;
      tokenId: string;
      uri: string;
      error?: string;
    }[] = tokensUri;

    if (results?.length) {
      const fallbackTokens: {
        collection: string;
        contract: string;
        tokenId: string;
      }[] = [];

      // Filter out tokens that have no metadata
      for (const result of results) {
        if (result.uri) {
          tokensToProcess.push(result as { contract: string; tokenId: string; uri: string });
        } else {
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "simpleHashFallbackDebug",
              message: `No uri found. contract=${result.contract}, tokenId=${result.tokenId}, error=${result.error}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
              contract: result.contract,
              error: result.error,
              reason: "No uri found",
            })
          );

          if (result.error === "Unable to decode tokenURI from contract") {
            let addToFallbackTokens = true;

            if (config.fallbackMetadataIndexingMethod) {
              try {
                const simplehashFallbackFailures = await redis.get(
                  `simplehash-fallback-failures:${result.contract}`
                );

                if (simplehashFallbackFailures) {
                  const simplehashFallbackFailuresCount = Number(simplehashFallbackFailures);

                  if (simplehashFallbackFailuresCount >= 100) {
                    addToFallbackTokens = false;
                  }
                }
              } catch (error) {
                logger.error(
                  this.queueName,
                  JSON.stringify({
                    topic: "simpleHashFallbackDebug",
                    message: `Skip Fallback Error. contract=${result.contract}, tokenId=${result.tokenId}, uri=${result.uri}, error=${error}`,
                    result,
                    error,
                  })
                );
              }
            }

            if (addToFallbackTokens) {
              redis.hset(
                "simplehash-fallback-debug-tokens-v2",
                `${result.contract}:${result.tokenId}`,
                result.error
              );

              fallbackTokens.push({
                collection: result.contract,
                contract: result.contract,
                tokenId: result.tokenId,
              });
            }
          }
        }
      }

      if (tokensToProcess.length) {
        // for (const tokenToProcess of tokensToProcess) {
        //   const tokenMetadataIndexingDebug = tokenMetadataIndexingDebugContracts.find(
        //     (t) => t.contract === tokenToProcess.contract && t.tokenMetadataIndexingDebug
        //   );
        //
        //   if (tokenMetadataIndexingDebug) {
        //     logger.info(
        //       this.queueName,
        //       JSON.stringify({
        //         topic: "tokenMetadataIndexingDebug",
        //         message: `onchainMetadataProcessTokenUriJob. contract=${tokenToProcess.contract}, tokenId=${tokenToProcess.tokenId}, uri=${tokenToProcess.uri}, error=${tokenToProcess.error}`,
        //         tokenToProcess,
        //         _getTokensMetadataUriLatency,
        //         fetchTokensCount: fetchTokens.length,
        //       })
        //     );
        //   }
        // }

        logger.info(this.queueName, `tokensToProcess = ${JSON.stringify(tokensToProcess)}`);
        await onchainMetadataProcessTokenUriJob.addToQueueBulk(tokensToProcess);
      }

      if (config.fallbackMetadataIndexingMethod && fallbackTokens.length) {
        await metadataIndexFetchJob.addToQueue(
          fallbackTokens.map((fallbackToken) => ({
            kind: "single-token",
            data: {
              method: config.fallbackMetadataIndexingMethod!,
              contract: fallbackToken.contract,
              tokenId: fallbackToken.tokenId,
              collection: fallbackToken.collection,
            },
            context: this.queueName,
          })),
          true,
          30
        );
      }
    }

    // If there are potentially more token uris to process, trigger another job
    const queueLength = await pendingRefreshTokens.length();
    if (queueLength > 0) {
      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const onchainMetadataFetchTokenUriJob = new OnchainMetadataFetchTokenUriJob();
