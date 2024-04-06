import { AddressZero } from "@ethersproject/constants";

import { OrderKind } from "@/orderbook/orders";

const FEE_BPS = 0;
const FEE_RECIPIENT = AddressZero;

export const attachOrderbookFee = async (params: {
  fee?: string[];
  feeRecipient?: string[];
  orderKind: OrderKind;
  orderbook: string;
}) => {
  // Only native orders
  if (params.orderbook != "reservoir") {
    return;
  }

  // Only certain order kinds
  const matchingOrderKinds: OrderKind[] = ["payment-processor-v2", "seaport-v1.5", "seaport-v1.6"];
  if (!matchingOrderKinds.includes(params.orderKind)) {
    return;
  }

  const singleFeeOrderKinds = ["payment-processor-v2"];
  if (FEE_BPS > 0) {
    params.fee = params.fee ?? [];
    params.feeRecipient = params.feeRecipient ?? [];

    // Skip single fee marketplaces for now
    if (params.fee.length >= 1 && singleFeeOrderKinds.includes(params.orderKind)) {
      return;
    }

    params.fee.push(String(FEE_BPS));
    params.feeRecipient.push(FEE_RECIPIENT);
  }
};
