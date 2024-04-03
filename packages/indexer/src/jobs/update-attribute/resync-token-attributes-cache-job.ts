import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";
import { config } from "@/config/index";
import _ from "lodash";

import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { logger } from "@/common/logger";

export type ResyncTokenAttributesCacheJobPayload = {
  contract: string;
  tokenId: string;
  context?: string;
};

export default class ResyncTokenAttributesCacheJob extends AbstractRabbitMqJobHandler {
  public static maxTokensPerAttribute = 15000;

  queueName = "resync-token-attributes-cache-queue";
  maxRetries = 10;
  concurrency = 3;

  public async process(payload: ResyncTokenAttributesCacheJobPayload) {
    const { contract, tokenId } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(
      contract,
      tokenId,
      ResyncTokenAttributesCacheJob.maxTokensPerAttribute
    );

    if (config.chainId === 1) {
      for (const tokenAttribute of tokenAttributes) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "debugCPU",
            message: `Processing Token Attribute. attributeId=${tokenAttribute.attributeId}`,
            payload,
            attributeId: tokenAttribute.attributeId,
          })
        );
      }
    }

    // Recalculate the number of tokens on sale for each attribute
    await resyncAttributeCacheJob.addToQueue(
      tokenAttributes.map((tokenAttribute) => ({
        attributeId: tokenAttribute.attributeId,
      }))
    );
  }

  public async addToQueue(
    params: ResyncTokenAttributesCacheJobPayload,
    delay = _.includes([1, 137], config.chainId) ? 60 * 10 * 1000 : 60 * 60 * 24 * 1000,
    forceRefresh = false
  ) {
    const token = `${params.contract}:${params.tokenId}`;
    const jobId = forceRefresh ? undefined : token;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncTokenAttributesCacheJob = new ResyncTokenAttributesCacheJob();
