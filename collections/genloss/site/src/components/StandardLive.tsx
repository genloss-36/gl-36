import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { HEADER_LEN, SLOT_LEN } from "@gl-36/sdk";
import type { Lang } from "../i18n/strings";
import { $chain } from "../lib/store";
import { lamportsPerByte } from "../lib/chain";
import { sol } from "../lib/format";
import { useT } from "./ui";

const SPL_NFT_BYTES = 82n + 165n + 679n + 282n + 4n * 128n;

export default function StandardLive({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const chain = useStore($chain);
  const [lpb, setLpb] = useState<bigint | null>(null);
  useEffect(() => { lamportsPerByte().then(setLpb).catch(() => {}); }, []);
  if (!chain || lpb === null) return <p className="live-note">&nbsp;</p>;
  return (
    <p className="live-note">
      {tr("std.live", {
        bytes: (HEADER_LEN + chain.col.minted * SLOT_LEN).toLocaleString("en-US"),
        rent: sol(chain.lamports, 5),
        spl: sol(lpb * SPL_NFT_BYTES, 4),
      })}
    </p>
  );
}
