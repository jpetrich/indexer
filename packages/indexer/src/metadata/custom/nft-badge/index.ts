/* eslint-disable @typescript-eslint/no-unused-vars */

import { logger } from "@/common/logger";

export const fetchToken = async ({ contract, tokenId }: { contract: string; tokenId: string }) => {
  logger.info(
    "nft-badge-fetcher",
    JSON.stringify({
      message: `fetchToken. contract=${contract}, tokenId=${tokenId}`,
      contract,
      tokenId,
    })
  );

  return {
    contract,
    tokenId,
    collection: contract.toLowerCase(),
    imageUrl: "https://storage.googleapis.com/deadzone-static/assets/badge.png",
  };
};
