import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingExpiredBidActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-expired-bid-activities-queue";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { redis } from "@/common/redis";

const BATCH_SIZE = 1000;
const BATCH_DELAY = 10 * 1000;

const MIN_BATCH_SIZE = [1, 137].includes(config.chainId) ? 1000 : 100;

export default class DeleteArchivedExpiredBidActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "delete-archived-expired-bid-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  singleActiveConsumer = true;

  public async process() {
    const pendingExpiredBidActivitiesQueue = new PendingExpiredBidActivitiesQueue();
    const pendingActivitiesCount = await pendingExpiredBidActivitiesQueue.count();

    if (pendingActivitiesCount >= MIN_BATCH_SIZE) {
      const batchSize = Number(await redis.get(`${this.queueName}-batch-size`)) || BATCH_SIZE;
      const batchDelay = Number(await redis.get(`${this.queueName}-batch-delay`)) || BATCH_DELAY;

      const pendingActivityIds = await pendingExpiredBidActivitiesQueue.get(batchSize);

      logger.info(
        this.queueName,
        `deleting activities. pendingActivitiesCount=${pendingActivityIds?.length}, batchSize=${batchSize}, batchDelay=${batchDelay}`
      );

      if (pendingActivityIds?.length > 0) {
        try {
          await ActivitiesIndex.deleteActivitiesById(pendingActivityIds);
        } catch (error) {
          logger.error(
            this.queueName,
            `failed to delete activities. error=${error}, pendingActivities=${JSON.stringify(
              pendingActivityIds
            )}`
          );

          await pendingExpiredBidActivitiesQueue.add(pendingActivityIds);
        }

        if (pendingActivitiesCount > batchSize) {
          await deleteArchivedExpiredBidActivitiesJob.addToQueue(batchDelay);
        }
      }
    }
  }

  public async addToQueue(delay = 0) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({}, delay);
  }
}

export const deleteArchivedExpiredBidActivitiesJob = new DeleteArchivedExpiredBidActivitiesJob();
