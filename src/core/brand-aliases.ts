/**
 * 中文（及常见俗名）→ 品牌 slug 别名表。
 *
 * 为什么需要：品牌索引里全是英文 slug 和英文 title，中文界面下搜「苹果」
 * 只会得到「没有匹配的品牌」。这不算 bug，但对中文用户是一道硬门槛——
 * 他连该输什么都不知道。这里给热门品牌补一层别名，让中文输入能命中。
 *
 * 只收**确定**的中文叫法：宁缺毋滥，别名指错品牌比搜不到更糟。
 * 值是品牌在索引里的 id（simple-icons 的 slug，或 SVGL 品牌名规范化后的键），
 * 与 searchBrands 里 `h.key.split(':')[1]` 同口径；不在索引里的值自然不命中。
 */
export const BRAND_ALIASES: Record<string, string[]> = {
  // 科技
  苹果: ['apple'],
  微软: ['microsoft', 'windows'],
  谷歌: ['google', 'googlegemini'],
  亚马逊: ['amazon'],
  脸书: ['facebook', 'meta'],
  推特: ['x'],
  特斯拉: ['tesla'],
  英伟达: ['nvidia'],
  英特尔: ['intel'],
  甲骨文: ['oracle'],
  网飞: ['netflix'],
  三星: ['samsung'],
  索尼: ['sony'],
  任天堂: ['nintendo'],
  世嘉: ['sega'],
  佳能: ['canon'],
  尼康: ['nikon'],
  思科: ['cisco'],
  高通: ['qualcomm'],
  诺基亚: ['nokia'],
  西门子: ['siemens'],
  飞利浦: ['philips'],
  空客: ['airbus'],
  波音: ['boeing'],
  大众: ['volkswagen'],
  宝马: ['bmw'],
  奔驰: ['mercedes'],
  奥迪: ['audi'],
  保时捷: ['porsche'],
  丰田: ['toyota'],
  本田: ['honda'],
  日产: ['nissan'],
  沃尔沃: ['volvo'],
  法拉利: ['ferrari'],
  福特: ['ford'],
  // 吃喝穿戴
  可口可乐: ['cocacola'],
  百事: ['pepsi'],
  星巴克: ['starbucks'],
  麦当劳: ['mcdonalds'],
  肯德基: ['kfc'],
  汉堡王: ['burgerking'],
  耐克: ['nike'],
  阿迪达斯: ['adidas'],
  彪马: ['puma'],
  优衣库: ['uniqlo'],
  宜家: ['ikea'],
  // 中国互联网
  腾讯: ['tencentqq', 'wechat'],
  微信: ['wechat'],
  阿里巴巴: ['alibaba'],
  淘宝: ['taobao'],
  支付宝: ['alipay'],
  百度: ['baidu'],
  字节跳动: ['bytedance'],
  抖音: ['tiktok'],
  微博: ['sinaweibo'],
  知乎: ['zhihu'],
  哔哩哔哩: ['bilibili'],
  B站: ['bilibili'],
  小米: ['xiaomi'],
  华为: ['huawei'],
  联想: ['lenovo'],
  大疆: ['dji'],
  魅族: ['meizu'],
  京东: ['jdcom'],
  网易: ['neteasecloudmusic'],
  // 开发 / 开放平台
  火狐: ['firefox'],
  电报: ['telegram'],
};

/** 查询 → 命中别名的品牌 id 列表（支持「苹果公司」这类包含式输入） */
export function aliasedBrandIds(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const direct = BRAND_ALIASES[q];
  if (direct) return direct;
  const out: string[] = [];
  for (const [key, ids] of Object.entries(BRAND_ALIASES)) {
    if (q.includes(key) || key.includes(q)) out.push(...ids);
  }
  return [...new Set(out)];
}
