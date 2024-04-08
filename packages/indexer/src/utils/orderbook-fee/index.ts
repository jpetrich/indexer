import { AddressZero } from "@ethersproject/constants";
import { OrderKind } from "@/orderbook/orders";
import { generatePaymentSplit, supportsPaymentSplits } from "@/utils/payment-splits";

export const FEE_BPS = 0;
export const FEE_RECIPIENT = AddressZero;

export const attachOrderbookFee = async (
  params: {
    fee?: string[];
    feeRecipient?: string[];
    orderKind: OrderKind;
    orderbook: string;
  },
  apiKey: string
) => {
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
      // Skip chains where payment splits are not supported
      if (!supportsPaymentSplits()) {
        return;
      }

      const paymentSplit = await generatePaymentSplit(
        apiKey,
        {
          recipient: params.feeRecipient[0],
          bps: Number(params.fee),
        },
        {
          recipient: FEE_RECIPIENT,
          bps: FEE_BPS,
        }
      );
      if (!paymentSplit) {
        throw new Error("Could not generate payment split");
      }

      // Override
      params.feeRecipient = [paymentSplit.address];
      params.fee = [String(params.fee.map(Number).reduce((a, b) => a + b) + FEE_BPS)];
    } else {
      params.fee.push(String(FEE_BPS));
      params.feeRecipient.push(FEE_RECIPIENT);
    }
  }
};
