import { canvasSize, scene, sceneIconSvgs, sceneLogoSvgs, sceneTexts } from '../core/scene';
import type { SceneState } from '../core/types';
import { svgForFile } from './fonts';

export const SVG_XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

/** SVG 文件内容：XML 声明 + 序列化 + CDN 字体引用（中文按需切片），不内嵌字体（SPEC 3.2） */
export async function svgFileContent(state: SceneState, t: number): Promise<string> {
  const iconSvgs = await sceneIconSvgs(state);
  // 官方完整字标（有则替代「符号 + 品牌名」）；变体按背景亮度挑，
  // 否则深底会拿到黑色字标直接消失
  const bg = state.palette?.bg ?? state.template.palette.bg;
  const { svgs: logoSvgs, aspect: logoAspect, ink: logoInk } = await sceneLogoSvgs(state, bg);
  const enriched: SceneState = { ...state, iconSvgs, logoSvgs, logoAspect, logoInk };
  return `${SVG_XML_DECL}\n${svgForFile(scene(enriched, t), sceneTexts(enriched))}`;
}

export function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

export function pngFilename(state: SceneState): string {
  const { w, h } = canvasSize(state.template, state.ratio);
  return `${state.template.id}-${w}x${h}.png`;
}

export function svgFilename(state: SceneState): string {
  const { w, h } = canvasSize(state.template, state.ratio);
  return `${state.template.id}-${w}x${h}.svg`;
}
