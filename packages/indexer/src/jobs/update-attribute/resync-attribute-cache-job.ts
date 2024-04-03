import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";
import { logger } from "@/common/logger";

export type ResyncAttributeCacheJobInfo = {
  attributeId: number;
};

export default class ResyncAttributeCacheJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-cache-queue";
  maxRetries = 10;
  concurrency = 3;

  public async process(payload: ResyncAttributeCacheJobInfo) {
    const attribute = await Attributes.getById(payload.attributeId);

    const { floorSell, onSaleCount } = await Tokens.getSellFloorValueAndOnSaleCount(
      attribute!.collectionId,
      attribute!.key,
      attribute!.value
    );

    await Attributes.update(payload.attributeId, {
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

    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "debugCPU",
        message: `Update. attributeId=${payload.attributeId}`,
        payload,
      })
    );
  }

  public async addToQueue(
    infos: ResyncAttributeCacheJobInfo[],
    delay = 60 * 1000,
    forceRefresh = false
  ) {
    await this.sendBatch(
      infos.map((info) => ({
        payload: info,
        jobId: forceRefresh ? undefined : `${info.attributeId}`,
        delay,
      }))
    );
  }
}

export const resyncAttributeCacheJob = new ResyncAttributeCacheJob();
