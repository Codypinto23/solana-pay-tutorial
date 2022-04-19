import BigNumber from "bignumber.js";
import { ParsedUrlQuery } from "querystring";
import { products } from "./products";

export default function calculatePrice(query: ParsedUrlQuery): BigNumber {
  let amount = new BigNumber(0);
  for (let [id, quantity] of Object.entries(query)) {
    const product = products.find(p => p.id === id)
    if (!product) continue;
    console.log("product is",product)
    //const price = product.priceSol
    const price = product.priceUsd
    const productQuantity = new BigNumber(quantity as string)
    amount = amount.plus(productQuantity.multipliedBy(price))
  }

  return amount
}
