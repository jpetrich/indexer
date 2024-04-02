import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";
import { config } from "@/config/index";
import _ from "lodash";
import { logger } from "@/common/logger";

export type ResyncAttributeCacheJobPayload = {
  contract: string;
  tokenId: string;
};

export default class ResyncAttributeCacheJob extends AbstractRabbitMqJobHandler {
  public static maxTokensPerAttribute = 15000;

  queueName = "resync-attribute-cache-queue";
  maxRetries = 10;
  concurrency = 3;

  public async process(payload: ResyncAttributeCacheJobPayload) {
    const { contract, tokenId } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(
      contract,
      tokenId,
      ResyncAttributeCacheJob.maxTokensPerAttribute
    );

    // Recalculate the number of tokens on sale for each attribute
    for (const tokenAttribute of tokenAttributes) {
      const startTimestamp = new Date().getTime();

      const { floorSell, onSaleCount } = await Tokens.getSellFloorValueAndOnSaleCount(
        tokenAttribute.collectionId,
        tokenAttribute.key,
        tokenAttribute.value
      );

      await Attributes.update(tokenAttribute.attributeId, {
        floorSellId: floorSell?.id,
        floorSellValue: floorSell?.value,
        floorSellCurrency: floorSell?.currency,
        floorSellCurrencyValue: floorSell?.currencyValue,
        floorSellMaker: floorSell?.maker,
        floorSellValidFrom: floorSell?.validFrom,
        floorSellValidTo: floorSell?.validTo,
        floorSellSourceIdInt: floorSell?.sourceIdInt,
        onSaleCount,
        sellUpdatedAt: new Date().toISOString(),
      });

      if (config.chainId === 1) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "debugCPU",
            message: `Start. contract=${contract}, tokenId=${tokenId}, attributeId=${tokenAttribute.attributeId}`,
            payload,
            tokenAttribute,
            token: `${contract}:${tokenId}`,
            tokenAndAttribute: `${contract}:${tokenId}:${tokenAttribute.attributeId}`,
            latencyMs: new Date().getTime() - startTimestamp,
          })
        );
      }
    }
  }

  public async addToQueue(
    params: ResyncAttributeCacheJobPayload,
    delay = _.includes([1, 137], config.chainId) ? 60 * 10 * 1000 : 60 * 60 * 24 * 1000,
    forceRefresh = false
  ) {
    const token = `${params.contract}:${params.tokenId}`;
    const jobId = forceRefresh ? undefined : token;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeCacheJob = new ResyncAttributeCacheJob();
