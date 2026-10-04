// Hand-written test data shared by every search test (Rule A). Names are real Kupittaa
// names or close to them, chosen to exercise Finnish compounds (`kevytmaito`,
// `ruisleipä` vs `leipäjuusto`), accents, apostrophes and aliases. Each tier is listed in
// rank order, as the build would write it.
import type { Category } from '@pathfinder/core';
import type { Aliases, CategoryRank, CategoryTop, TierData, TierNumber } from './types';

/** A fake but valid-looking 13-digit EAN, so fixtures read as numbers 1, 2, 3… */
export const ean = (n: number): string => String(6400000000000 + n);

export const categories: Category[] = [
  { id: 1, name: 'Maito, juusto, munat ja rasvat', temperature: 'chilled' },
  { id: 2, name: 'Maitotuotteet', temperature: 'chilled', parentId: 1 },
  { id: 3, name: 'Maidot', temperature: 'chilled', parentId: 2 },
  { id: 4, name: 'Juustot', temperature: 'chilled', parentId: 2 },
  { id: 5, name: 'Leivät, keksit ja leivonnaiset', temperature: 'ambient' },
  { id: 6, name: 'Leivät', temperature: 'ambient', parentId: 5 },
  { id: 7, name: 'Ruisleivät', temperature: 'ambient', parentId: 6 },
  { id: 8, name: 'Hedelmät ja vihannekset', temperature: 'chilled' },
  { id: 9, name: 'Hedelmät', temperature: 'chilled', parentId: 8 },
  { id: 10, name: 'Banaanit', temperature: 'ambient', parentId: 9 },
  { id: 11, name: 'Kodinhoito ja taloustarvikkeet', temperature: 'ambient' },
  { id: 12, name: 'Pesuaineet', temperature: 'ambient', parentId: 11 },
  { id: 13, name: 'Vaatteet ja asusteet', temperature: 'ambient' },
];

/** [ean number, name, category id], in rank order per tier. */
type Row = [number, string, number];

const rows: Record<TierNumber, Row[]> = {
  1: [
    [1, 'Pirkka banaani', 10],
    [2, 'Pirkka suomalainen kevytmaito 1l', 3],
    [3, 'Pirkka laktoositon kevytmaitojuoma 1l', 3],
    [4, 'Pirkka suomalainen rasvaton maito 1l', 3],
    [5, 'Vaasan Ruispalat 660 g täysjyväruisleipä', 7],
    [6, 'Pirkka leipäjuusto 310g laktoositon', 4],
    [7, 'Fazer Puikula ruisleipä 9kpl/500g', 7],
    [8, 'Valio maitorahka 250g', 2],
    [9, 'Chiquita banaani', 10],
    [10, 'Pirkka kermajuusto 1 kg laktoositon', 4],
    [11, 'Valio Arki crème fraîche 12%', 2],
    [12, 'Pirkka luomu maito 1l', 3],
  ],
  2: [
    [13, 'Valio luomu kevytmaito 1l', 3],
    [14, 'Oululainen Reissumies ruisleipä', 7],
    [15, 'Fairy astianpesuaine 450ml', 12],
    [16, 'Pirkka astianpesuaine omena 500ml', 12],
    [17, 'Heti kirjopyykin pesuaine 1,5l', 12],
    [18, 'Valio laktoositon maitojuoma 1l', 3],
  ],
  3: [
    [19, 'Lambi WC-paperi 8 rl', 11],
    [20, 'Serla talouspaperi 4 rl', 11],
    [21, "L'Oréal Paris Elvital shampoo 250ml", 11],
    [22, 'Fazer Sininen maitosuklaa 200g', 2],
    [23, 'Pirkka puuvillasukat 3 paria', 13],
    [24, 'Jamón Serrano 100g', 1],
  ],
};

const tier = (n: TierNumber): TierData => ({
  version: 1,
  tier: n,
  eans: rows[n].map(([e]) => ean(e)),
  names: rows[n].map(([, name]) => name),
  categoryIds: rows[n].map(([, , id]) => id),
});

export const tiers: Record<TierNumber, TierData> = { 1: tier(1), 2: tier(2), 3: tier(3) };

export const aliases: Aliases = {
  vessapaperi: ['wc-paperi', 'talouspaperi'],
  leipä: ['leivät', 'leipä'],
  maitoa: ['maito'],
};

/** Top 10 of each category's subtree in rank order, consistent with `tiers`. */
const dairyTop = [2, 3, 4, 6, 8, 10, 11, 12, 13, 18].map(ean);
const ryeBreadTop = [5, 7, 14].map(ean);
const bananaTop = [1, 9].map(ean);
const detergentTop = [15, 16, 17].map(ean);

export const categoryTop: CategoryTop = {
  1: dairyTop,
  2: dairyTop,
  3: [2, 3, 4, 12, 13, 18].map(ean),
  4: [6, 10].map(ean),
  5: ryeBreadTop,
  6: ryeBreadTop,
  7: ryeBreadTop,
  8: bananaTop,
  9: bananaTop,
  10: bananaTop,
  11: [...detergentTop, ...[19, 20, 21].map(ean)],
  12: detergentTop,
  13: [ean(23)],
};

export const categoryRank: CategoryRank = {
  1: 1,
  2: 1,
  3: 1,
  4: 5,
  5: 4,
  6: 4,
  7: 4,
  8: 0,
  9: 0,
  10: 0,
  11: 14,
  12: 14,
  13: 22,
};
