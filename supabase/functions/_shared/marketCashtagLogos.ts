/**
 * Static cashtag logos for bundled seed rows — R2 when configured, CoinGecko fallback for crypto.
 * Keep in sync with `src/features/lounge/marketCashtagLogos.js`.
 */

import { coingeckoCoinIdForTicker } from './marketCashtagCrypto.ts'
import { marketLogoR2PublicUrlForInstrument, readMarketLogoR2Config } from './marketLogoR2.ts'

/** CoinGecko `/coins/markets` `image` for seeded cashtag crypto (refresh rarely). */
export const COINGECKO_LOGO_BY_COIN_ID: Record<string, string> = {
  bitcoin: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ethereum: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  binancecoin: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  ripple: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  solana: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  tron: 'https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png?1776048311',
  dogecoin: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  chainlink: 'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  cardano: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
  stellar: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
  'bitcoin-cash': 'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
  litecoin: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
  'hedera-hashgraph': 'https://coin-images.coingecko.com/coins/images/3688/large/hbar.png?1696504364',
  sui: 'https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290',
  'avalanche-2': 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
  'crypto-com-chain': 'https://coin-images.coingecko.com/coins/images/7310/large/cro_token_logo.png?1696507599',
  near: 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367',
  'shiba-inu': 'https://coin-images.coingecko.com/coins/images/11939/large/shiba.png?1696511800',
  uniswap: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  bittensor: 'https://coin-images.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg?1696527447',
  aave: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
  polkadot: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446',
  'worldcoin-wld': 'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
  'internet-computer': 'https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180',
  pepe: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  'ethereum-classic': 'https://coin-images.coingecko.com/coins/images/453/large/ethereum-classic-logo.png?1696501717',
  'render-token': 'https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529',
  algorand: 'https://coin-images.coingecko.com/coins/images/4380/large/download.png?1696504978',
  cosmos: 'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  filecoin: 'https://coin-images.coingecko.com/coins/images/12817/large/filecoin.png?1696512609',
  arbitrum: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  aptos: 'https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png?1761789140',
  'injective-protocol': 'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  vechain: 'https://coin-images.coingecko.com/coins/images/1167/large/VET.png?1742383283',
  'fetch-ai': 'https://coin-images.coingecko.com/coins/images/5681/large/ASI.png?1719827289',
  celestia: 'https://coin-images.coingecko.com/coins/images/31967/large/tia.jpg?1696530772',
  'sei-network': 'https://coin-images.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png?1696527207',
  blockstack: 'https://coin-images.coingecko.com/coins/images/2069/large/Stacks_Logo_png.png?1709979332',
  bonk: 'https://coin-images.coingecko.com/coins/images/28600/large/bonk.jpg?1696527587',
  optimism: 'https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081',
  thorchain: 'https://coin-images.coingecko.com/coins/images/6595/large/THORChain_RUNE_Token.png?1782452363',
  dogwifcoin: 'https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg?1702499428',
  maker: 'https://coin-images.coingecko.com/coins/images/1364/large/Mark_Maker.png?1696502423',
  'matic-network': 'https://coin-images.coingecko.com/coins/images/4713/large/polygon.png?1698233745',
}

export function coingeckoLogoUrlForCoinId(coinId: string): string {
  const id = String(coinId || '').trim()
  return id ? String(COINGECKO_LOGO_BY_COIN_ID[id] || '').trim() : ''
}

/**
 * Seed ETF / liquid-ticker logos when Finnhub + Yahoo omit them (e.g. SPDR GLD).
 * Keep in sync with `src/features/lounge/marketCashtagLogos.js`.
 */
export const FMP_STOCK_LOGO_BY_TICKER: Record<string, string> = {
  SPY: 'https://financialmodelingprep.com/image-stock/SPY.png',
  QQQ: 'https://financialmodelingprep.com/image-stock/QQQ.png',
  IWM: 'https://financialmodelingprep.com/image-stock/IWM.png',
  DIA: 'https://financialmodelingprep.com/image-stock/DIA.png',
  GLD: 'https://financialmodelingprep.com/image-stock/GLD.png',
  SLV: 'https://financialmodelingprep.com/image-stock/SLV.png',
  IAU: 'https://financialmodelingprep.com/image-stock/IAU.png',
  TLT: 'https://financialmodelingprep.com/image-stock/TLT.png',
  HYG: 'https://financialmodelingprep.com/image-stock/HYG.png',
  XLF: 'https://financialmodelingprep.com/image-stock/XLF.png',
  XLE: 'https://financialmodelingprep.com/image-stock/XLE.png',
}

export function fmpStockLogoUrlForTicker(ticker: string): string {
  const key = String(ticker || '')
    .trim()
    .toUpperCase()
    .split(/[.:]/)[0]
  return key ? String(FMP_STOCK_LOGO_BY_TICKER[key] || '').trim() : ''
}

/** Broken guess URL — static Finnhub path 404s; treat as missing logo. */
export function isGuessedFinnhubStockLogoUrl(url: string): boolean {
  return /static2\.finnhub\.io\/file\/publicdatany\/finnhubimage\/stock_logo\//i.test(String(url || ''))
}

function readMarketLogoR2PublicBaseUrl(): string {
  try {
    return String(readMarketLogoR2Config().publicBaseUrl || '')
      .trim()
      .replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function marketLogoR2UrlForRow(row: {
  asset_class: string
  display_symbol?: string
  symbol?: string
  coin_id?: string
}): string {
  const base = readMarketLogoR2PublicBaseUrl()
  if (!base) return ''
  try {
    const cfg = readMarketLogoR2Config()
    const assetClass = row.asset_class === 'crypto' ? 'crypto' : 'stock'
    return marketLogoR2PublicUrlForInstrument(cfg, {
      asset_class: assetClass,
      display_symbol: String(row.display_symbol || row.symbol || '').trim(),
      symbol: String(row.symbol || row.display_symbol || '').trim(),
      coin_id: row.coin_id ? String(row.coin_id).trim() : null,
    })
  } catch {
    return ''
  }
}

/** Seed / registry rows — prefer mirrored R2 logo URLs (no upstream logo fetch). */
export function withCashtagRowLogo<
  T extends {
    asset_class: string
    display_symbol?: string
    symbol?: string
    coin_id?: string
    logo_url?: string
    logo?: string
  },
>(row: T): T {
  let existing = String(row.logo_url || row.logo || '').trim()
  if (existing && isGuessedFinnhubStockLogoUrl(existing)) {
    existing = ''
  }
  if (existing) return row

  if (row.asset_class !== 'crypto') {
    const display = String(row.display_symbol || row.symbol || '').trim().toUpperCase()
    const fmpLogo = fmpStockLogoUrlForTicker(display)
    if (fmpLogo) return { ...row, logo_url: fmpLogo }
    const r2Logo = marketLogoR2UrlForRow(row)
    return r2Logo ? { ...row, logo_url: r2Logo } : row
  }

  const r2Logo = marketLogoR2UrlForRow(row)
  if (r2Logo) return { ...row, logo_url: r2Logo }

  let logo_url = coingeckoLogoUrlForCoinId(String(row.coin_id || ''))
  if (!logo_url) {
    const display = String(row.display_symbol || row.symbol || '').trim().toUpperCase()
    logo_url = coingeckoLogoUrlForCoinId(coingeckoCoinIdForTicker(display))
  }

  return logo_url ? { ...row, logo_url } : row
}
