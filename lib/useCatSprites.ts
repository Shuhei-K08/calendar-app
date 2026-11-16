"use client";

// ねこの絵の一覧（もとからの絵＋管理画面で追加した絵）。読み込めたら出し直す
import { useEffect, useState } from "react";
import { allSprites, customSpriteList, loadCustomSprites, type CatSprite } from "@/lib/catVisitor";

export const CAT_SPRITES_CHANGED = "sharecal-cat-sprites-changed";

/** includeHidden：止めている追加の絵も含める（管理画面） */
export function useCatSprites(includeHidden = false): CatSprite[] {
  const pick = () => (includeHidden ? [...allSprites().filter((s) => !s.custom), ...customSpriteList()] : allSprites());
  const [list, setList] = useState<CatSprite[]>(pick);
  useEffect(() => {
    let alive = true;
    const refresh = (force: boolean) =>
      void loadCustomSprites(force).then(() => {
        if (alive) setList(includeHidden ? [...allSprites().filter((s) => !s.custom), ...customSpriteList()] : allSprites());
      });
    refresh(false);
    const onChange = () => refresh(true);
    window.addEventListener(CAT_SPRITES_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CAT_SPRITES_CHANGED, onChange);
    };
  }, [includeHidden]);
  return list;
}
