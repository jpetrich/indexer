import * as Sdk from "@reservoir0x/sdk";

import { getBuildInfo } from "../utils";
import {
  BuyTokenBuilderBase,
  BuildOrderOptions,
} from "@/orderbook/orders/seaport-base/build/buy/token";

export const build = async (options: BuildOrderOptions) => {
  const builder = new BuyTokenBuilderBase(getBuildInfo);
  return await builder.build(options, Sdk.SeaportV14.Order);
};
