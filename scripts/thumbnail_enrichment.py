#!/usr/bin/env python3
"""
Motor de Miniaturas Locais - Clínica FAAZ / FRdoc 2.0 (100% GPU Local / Custo Zero)

Gera fotografias macro de estúdio via stable-diffusion.cpp (Vulkan) + Z-Image-Turbo
na GPU local (AMD Radeon RX 9060 XT 16 GB), comprime localmente para WebP 100x100px
(2 a 5 KB) e grava o caminho relativo '/food-thumbnails/<sha256>.webp' no Oracle.

Uso:
  python scripts/thumbnail_enrichment.py --only-missing             # gera SOMENTE alimentos sem miniatura
  python scripts/thumbnail_enrichment.py --only-missing --limit 100 # gera em blocos de 100 (pausável)
  python scripts/thumbnail_enrichment.py --ids A,B --seed-offset 100
  python scripts/thumbnail_enrichment.py --ids-file reprovados.json --seed-offset 100
  python scripts/thumbnail_enrichment.py --gerar-revisao            # atualiza revisao_local.html sem rodar GPU
  python scripts/thumbnail_enrichment.py --pilot                    # piloto dos 5 alimentos difíceis + HTML
  python scripts/thumbnail_enrichment.py --dry-run --limit 5        # testa sem gravar no banco
"""
import argparse
import base64
import hashlib
import html
import io
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import oracledb
import requests
from dotenv import load_dotenv
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from food_prompts import build_prompt

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

OUT_DIR = ROOT / "public" / "food-thumbnails"
WORK_DIR = ROOT / "scratch" / "thumbnails"
PILOT_PREVIEWS_DIR = WORK_DIR / "pilot_previews"
PILOT_HTML = WORK_DIR / "piloto_local.html"
REVIEW_HTML = WORK_DIR / "revisao_local.html"
REPORT_FILE = WORK_DIR / "relatorio_local.json"
NEW_IDS_FILE = WORK_DIR / "novos_ids_expansao.json"
NEW_EXPANSION_FONTES = {"TBCA/POF-IBGE", "FRdoc Clínico"}

LOCAL_BIN_DIR = Path(os.getenv("SD_CPP_BIN", Path(os.environ["LOCALAPPDATA"]) / "EndocImageGen" / "bin"))
LOCAL_MOD_DIR = Path(os.getenv("SD_MODELS_DIR", Path(os.environ["LOCALAPPDATA"]) / "EndocImageGen" / "models"))
SD_SERVER_EXE = LOCAL_BIN_DIR / "sd-server.exe"

URL_PREFIX = "/food-thumbnails"
OWN_URL_LIKE = "%/food-thumbnails/%.webp"
TABLE, ID_COL, NAME_COL, CAT_COL, URL_COL = "ALIMENTOS", "ID", "NOME", "CATEGORIA", "THUMBNAILURL"

MODEL_NAME = "Z-Image-Turbo (Q6_K) + Qwen3-4B (Q4_K_M) [Vulkan / RX 9060 XT]"
GEN_SIZE = int(os.getenv("GEN_SIZE", "256"))
GEN_STEPS = int(os.getenv("GEN_STEPS", "5"))
GEN_CFG = float(os.getenv("GEN_CFG", "1.0"))
MIN_KB, MAX_KB = 2.0, 5.0
THUMB_SIZE = (100, 100)

PILOT_FOODS = [
    "Abóbora, cabotian, cozida",
    "Arroz carreteiro",
    "Pupunha, cozida",
    "Pão, de queijo, assado",
    "Carne, bovina, acém, moído, cru",
]

WORK_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(WORK_DIR / "carga_local.log", encoding="utf-8"),
    ],
)
LOG = logging.getLogger("faaz-local-gen")


# ----------------------------------------------------------------------------- servidor GPU local
class LocalDiffusionServer:
    def __init__(
        self,
        port: int = 18765,
        external_url: str | None = None,
        size: int = GEN_SIZE,
        steps: int = GEN_STEPS,
        cache_mode: str = "",
        cache_option: str = "",
    ):
        self.base_url = (external_url or f"http://127.0.0.1:{port}").rstrip("/")
        self.port = port
        self.size = size
        self.steps = steps
        self.cache_mode = cache_mode
        self.cache_option = cache_option
        self.proc: subprocess.Popen | None = None
        self._log_file = None
        self.session = requests.Session()

    def __enter__(self):
        if self._is_ready():
            LOG.info(f"Usando servidor sd-server já ativo em {self.base_url}")
            return self

        diff = LOCAL_MOD_DIR / "z_image_turbo-Q6_K.gguf"
        vae = LOCAL_MOD_DIR / "ae.safetensors"
        llm = LOCAL_MOD_DIR / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
        for f in (SD_SERVER_EXE, diff, vae, llm):
            if not f.exists():
                raise FileNotFoundError(f"Arquivo necessário não encontrado: {f}")

        cmd = [
            str(SD_SERVER_EXE),
            "--listen-ip", "127.0.0.1",
            "--listen-port", str(self.port),
            "--diffusion-model", str(diff),
            "--vae", str(vae),
            "--llm", str(llm),
            "--flash-attn", "on",
            "--disable-image-metadata",
            "--eager-load",
        ]
        if self.cache_mode:
            cmd.extend(["--cache-mode", self.cache_mode])
            if self.cache_option:
                cmd.extend(["--cache-option", self.cache_option])

        self._log_file = open(WORK_DIR / "sd_server.log", "w", encoding="utf-8")
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.proc = subprocess.Popen(cmd, stdout=self._log_file, stderr=subprocess.STDOUT, creationflags=creationflags)
        LOG.info(
            f"Iniciando sd-server local ({MODEL_NAME}) na porta {self.port} "
            f"[flash-attn=on, eager-load, {self.size}x{self.size}, {self.steps} passos]..."
        )
        for _ in range(180):
            if self.proc.poll() is not None:
                raise RuntimeError(f"sd-server encerrou (código {self.proc.returncode}). Veja {WORK_DIR / 'sd_server.log'}")
            if self._is_ready():
                LOG.info("sd-server pronto na GPU (pesos carregados 1x em VRAM).")
                return self
            time.sleep(0.5)
        raise TimeoutError("Tempo esgotado aguardando sd-server na GPU.")

    def __exit__(self, *_):
        self.session.close()
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if self._log_file:
            self._log_file.close()

    def _is_ready(self) -> bool:
        try:
            return self.session.get(f"{self.base_url}/v1/models", timeout=1).ok
        except requests.RequestException:
            return False

    def generate(self, prompt: str, seed: int) -> bytes:
        for attempt in range(2):
            try:
                r = self.session.post(
                    f"{self.base_url}/sdapi/v1/txt2img",
                    json={
                        "prompt": prompt,
                        "width": self.size,
                        "height": self.size,
                        "steps": self.steps,
                        "cfg_scale": GEN_CFG,
                        "sampler_name": "euler",
                        "seed": seed,
                    },
                    timeout=120,
                )
                r.raise_for_status()
                images = r.json().get("images") or []
                if not images:
                    raise RuntimeError(f"Resposta sem imagem: {r.text[:200]}")
                return base64.b64decode(images[0])
            except Exception:
                if attempt == 1:
                    raise
                time.sleep(1.0)
        raise RuntimeError("Falha ao gerar imagem")


# ----------------------------------------------------------------------------- imagem WebP
def make_webp(raw_png: bytes) -> tuple[bytes, int]:
    """Recorte central 100x100 e compressão WebP ajustada para ficar entre 2 e 5 KB."""
    im = Image.open(io.BytesIO(raw_png)).convert("RGB")
    im = ImageOps.fit(im, THUMB_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

    def encode(q: int) -> bytes:
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=4)
        return buf.getvalue()

    q = 92
    data = encode(q)
    while len(data) > MAX_KB * 1024 and q > 30:
        q -= 6
        data = encode(q)
    while len(data) < MIN_KB * 1024 and q < 100:
        q = min(100, q + 4)
        data = encode(q)
    return data, q


# ----------------------------------------------------------------------------- banco Oracle
def connect():
    return oracledb.connect(
        user=os.getenv("ORACLE_USER") or os.environ["DATABASE_USER"],
        password=os.getenv("ORACLE_PASSWORD") or os.environ["DATABASE_PASSWORD"],
        dsn=(os.getenv("ORACLE_DSN") or os.environ["DATABASE_URL"]).strip('"'),
    )


def fetch_rows(cur, limit=None, ids=None, names=None, only_missing: bool = False):
    pending = f"({URL_COL} IS NULL OR {URL_COL} NOT LIKE '{OWN_URL_LIKE}')"
    if ids:
        binds = ",".join(f":{i}" for i in range(len(ids)))
        where = f"{ID_COL} IN ({binds})"
        if only_missing:
            where += f" AND {pending}"
        sql = f"SELECT {ID_COL}, {NAME_COL}, {CAT_COL} FROM {TABLE} WHERE {where} ORDER BY {NAME_COL}"
        if limit:
            sql += f" FETCH FIRST {int(limit)} ROWS ONLY"
        cur.execute(sql, ids)
        return cur.fetchall()
    if names:
        binds = ",".join(f":{i}" for i in range(len(names)))
        cur.execute(f"SELECT {ID_COL}, {NAME_COL}, {CAT_COL} FROM {TABLE} WHERE {NAME_COL} IN ({binds})", names)
        by_name = {r[1]: r for r in cur.fetchall()}
        return [by_name[n] for n in names if n in by_name]
    sql = f"SELECT {ID_COL}, {NAME_COL}, {CAT_COL} FROM {TABLE} WHERE {pending} ORDER BY {NAME_COL}"
    if limit:
        sql += f" FETCH FIRST {int(limit)} ROWS ONLY"
    cur.execute(sql)
    return cur.fetchall()


def load_used_digests(cur) -> set[str]:
    cur.execute(f"SELECT {URL_COL} FROM {TABLE} WHERE {URL_COL} LIKE '{OWN_URL_LIKE}'")
    return {Path(r[0]).stem for r in cur}


def set_url(conn, food_id: str, url: str | None) -> None:
    cur = conn.cursor()
    cur.execute(f"UPDATE {TABLE} SET {URL_COL} = :u, UPDATED_AT = SYSTIMESTAMP WHERE {ID_COL} = :i",
                u=url, i=food_id)
    conn.commit()
    cur.close()


# ----------------------------------------------------------------------------- HTML de conferência
def render_html(items: list[dict], out_path: Path, title: str, pilot: bool = False) -> Path:
    cards = []
    for it in items:
        thumb_rel = f"../../public/food-thumbnails/{it['digest']}.webp" if it.get("digest") else ""
        preview_rel = f"pilot_previews/{it['id']}.png" if pilot and (PILOT_PREVIEWS_DIR / f"{it['id']}.png").exists() else ""
        imgs_html = (
            f'<div class="imgs">'
            + (f'<div><img class="prev" src="{preview_rel}"><span>{GEN_SIZE}×{GEN_SIZE}</span></div>' if preview_rel else "")
            + f'<div><img class="thumb" src="{thumb_rel}"><span>100×100 WebP<br>{it.get("kb", 0):.2f} KB (q={it.get("quality")})</span></div>'
            + '</div>'
        )
        cards.append(
            f'<div class="card">'
            f'{imgs_html}'
            f'<div class="nome">{html.escape(it["nome"])}</div>'
            f'<div class="meta">{html.escape(it.get("categoria", ""))} · {it.get("gen_s", 0):.2f}s · seed {it.get("seed")}</div>'
            f'<div class="prompt">{html.escape(it.get("prompt", ""))}</div>'
            f'<div class="id">{it["id"]}</div>'
            f'</div>'
        )
    doc = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
  h1 {{ margin: 0 0 6px; font-size: 20px; }}
  .sub {{ color: #475569; font-size: 13px; margin-bottom: 18px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax({340 if pilot else 220}px, 1fr)); gap: 14px; }}
  .card {{ background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }}
  .imgs {{ display: flex; gap: 12px; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 8px; padding: 10px; }}
  .imgs > div {{ display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: #475569; text-align: center; }}
  .prev {{ width: 180px; height: 180px; object-fit: cover; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; }}
  .thumb {{ width: 100px; height: 100px; object-fit: cover; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; }}
  .nome {{ font-weight: 700; font-size: 14px; }}
  .meta {{ font-size: 12px; color: #0f766e; font-weight: 600; }}
  .prompt {{ font-size: 11px; color: #475569; line-height: 1.35; }}
  .id {{ font-family: ui-monospace, monospace; font-size: 10.5px; color: #94a3b8; }}
</style></head><body>
<h1>{html.escape(title)}</h1>
<div class="sub">Motor: {html.escape(MODEL_NAME)} · {GEN_SIZE}×{GEN_SIZE} ({GEN_STEPS} passos, CFG {GEN_CFG}) · {len(items)} alimentos</div>
<div class="grid">{''.join(cards)}</div>
</body></html>"""
    out_path.write_text(doc, encoding="utf-8")
    return out_path


def _load_new_expansion_ids() -> set[str]:
    if not NEW_IDS_FILE.exists():
        return set()
    try:
        data = json.loads(NEW_IDS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return {str(x) for x in data}
    except Exception:
        pass
    return set()


def render_review_html(conn, report_by_id: dict[str, dict]) -> Path:
    """Gera scratch/thumbnails/revisao_local.html interativa com todos os alimentos do Oracle."""
    new_ids_set = _load_new_expansion_ids()
    cur = conn.cursor()
    cur.execute(f"SELECT {ID_COL}, {NAME_COL}, {CAT_COL}, {URL_COL}, FONTE FROM {TABLE} ORDER BY {NAME_COL}")
    items = []
    for fid, nome, cat, url, fonte in cur.fetchall():
        fid, nome, cat = str(fid), str(nome), str(cat or "Geral")
        fonte_str = str(fonte or "")
        is_new = (fid in new_ids_set) or (fonte_str in NEW_EXPANSION_FONTES)
        digest = Path(url).stem if url else ""
        webp_path = OUT_DIR / f"{digest}.webp" if digest else None
        kb = round(webp_path.stat().st_size / 1024, 2) if webp_path and webp_path.exists() else 0
        rep = report_by_id.get(fid, {})
        items.append({
            "id": fid, "nome": nome, "categoria": cat, "fonte": fonte_str, "is_new": is_new,
            "img": f"../../public/food-thumbnails/{digest}.webp" if webp_path and webp_path.exists() else "",
            "kb": kb, "gen_s": rep.get("gen_s", 0), "seed": rep.get("seed", ""),
            "prompt": rep.get("prompt") or build_prompt(nome, cat),
        })
    cur.close()

    data_json = json.dumps(items, ensure_ascii=False)
    doc = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>Revisão Final Miniaturas Locais ({len(items)} alimentos) - Clínica FAAZ / FRdoc 2.0</title>
<style>
  body {{ font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 84px 20px 40px; }}
  header {{ position: fixed; top: 0; left: 0; right: 0; z-index: 20; background: #0f172a; color: #fff;
           padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
           box-shadow: 0 2px 10px rgba(0,0,0,.2); }}
  header h1 {{ font-size: 16px; margin: 0 10px 0 0; }}
  .stats {{ font-size: 13px; color: #cbd5e1; margin-right: auto; }}
  input, select, button {{ font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; border: 1px solid #475569; }}
  input, select {{ background: #1e293b; color: #fff; }}
  button {{ cursor: pointer; background: #334155; color: #fff; border: 0; font-weight: 600; }}
  button.secondary {{ background: #0284c7; }}
  button.primary {{ background: #ef4444; }}
  button.ghost {{ background: transparent; border: 1px solid #64748b; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }}
  .card {{ background: #fff; border: 2px solid #e2e8f0; border-radius: 10px; padding: 10px; cursor: pointer;
           display: flex; flex-direction: column; gap: 5px; position: relative; user-select: none; }}
  .card:hover {{ border-color: #94a3b8; }}
  .card.is-new::before {{ content: "NOVO"; position: absolute; top: 6px; left: 6px; background: #059669;
                         color: #fff; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }}
  .card.bad {{ border-color: #ef4444; background: #fef2f2; box-shadow: 0 0 0 2px rgba(239,68,68,.22); }}
  .card.bad::after {{ content: "REGERAR"; position: absolute; top: 6px; right: 6px; background: #ef4444;
                      color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }}
  .thumb {{ width: 100px; height: 100px; margin: 2px auto; border-radius: 8px; object-fit: cover; background: #fff; border: 1px solid #e2e8f0; display: block; }}
  .noimg {{ width: 100px; height: 100px; margin: 2px auto; border-radius: 8px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #64748b; }}
  .nome {{ font-size: 12.5px; font-weight: 700; line-height: 1.25; }}
  .meta {{ font-size: 11px; color: #0f766e; font-weight: 600; }}
  .prompt {{ font-size: 10.5px; color: #475569; line-height: 1.3; }}
  .id {{ font-family: ui-monospace, monospace; font-size: 10px; color: #94a3b8; }}
  dialog {{ border: 0; border-radius: 10px; padding: 20px; max-width: 720px; width: 92%; box-shadow: 0 12px 40px rgba(0,0,0,.3); }}
  textarea {{ width: 100%; height: 150px; font-family: ui-monospace, monospace; font-size: 12px; margin: 10px 0; }}
</style></head><body>
<header>
  <h1>Revisão Final ({len(items)} alimentos)</h1>
  <span class="stats" id="stats"></span>
  <input id="q" placeholder="Filtrar nome, categoria, prompt ou ID..." style="width:230px">
  <select id="f">
    <option value="all">Todos</option>
    <option value="new">Só novos (desta rodada)</option>
    <option value="bad">Só marcados p/ regerar</option>
    <option value="miss">Sem imagem</option>
  </select>
  <button class="secondary" onclick="exportar('cmd')">Copiar comando --ids</button>
  <button class="primary" onclick="exportar('json')">Baixar reprovados.json</button>
  <button class="ghost" onclick="limpar()">Limpar</button>
</header>
<div class="grid" id="grid"></div>
<dialog id="dlg">
  <h3 style="margin:0 0 6px">Itens marcados para regerar (<span id="dcount"></span>)</h3>
  <textarea id="dout" readonly></textarea>
  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button class="secondary" onclick="navigator.clipboard.writeText(dout.value)">Copiar</button>
    <button onclick="dlg.close()">Fechar</button>
  </div>
</dialog>
<script>
const DATA = {data_json};
const KEY = "faaz_local_regen_v1";
const bad = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
const save = () => localStorage.setItem(KEY, JSON.stringify([...bad]));
const esc = s => String(s).replace(/[&<>"']/g, c => ({{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}}[c]));

function render() {{
  const q = document.getElementById("q").value.toLowerCase();
  const f = document.getElementById("f").value;
  const g = document.getElementById("grid");
  const list = DATA.filter(x => {{
    if (f === "new" && !x.is_new) return false;
    if (f === "bad" && !bad.has(x.id)) return false;
    if (f === "miss" && x.img) return false;
    if (q && !(x.nome + " " + x.categoria + " " + x.prompt + " " + x.id).toLowerCase().includes(q)) return false;
    return true;
  }});
  const miss = DATA.filter(x => !x.img).length;
  const totalNew = DATA.filter(x => x.is_new).length;
  document.getElementById("stats").textContent =
    `${{DATA.length}} itens · ${{totalNew}} novos · ${{miss}} pendentes · ${{bad.size}} p/ regerar · exibindo ${{list.length}}`;
  g.innerHTML = "";
  for (const x of list) {{
    const card = document.createElement("div");
    card.className = "card" + (x.is_new ? " is-new" : "") + (bad.has(x.id) ? " bad" : "");
    card.onclick = () => {{ bad.has(x.id) ? bad.delete(x.id) : bad.add(x.id); save(); render(); }};
    card.innerHTML = (x.img ? `<img class="thumb" src="${{x.img}}" loading="lazy">` : `<div class="noimg">sem imagem</div>`) +
      `<div class="nome">${{esc(x.nome)}}</div>` +
      `<div class="meta">${{esc(x.categoria)}} · ${{x.kb ? x.kb + " KB" : "-"}}${{x.gen_s ? " · " + x.gen_s + "s" : ""}}</div>` +
      `<div class="prompt">${{esc(x.prompt)}}</div>` +
      `<div class="id">${{x.id}}</div>`;
    g.appendChild(card);
  }}
}}
function exportar(mode) {{
  const ids = [...bad];
  if (mode === "json") {{
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ids, null, 2)], {{type:"application/json"}}));
    a.download = "reprovados.json";
    a.click();
    return;
  }}
  dcount.textContent = ids.length;
  dout.value = !ids.length
    ? "(nenhum item marcado)"
    : ids.length <= 150
      ? `python scripts/thumbnail_enrichment.py --ids "${{ids.join(",")}}" --seed-offset 100`
      : `python scripts/thumbnail_enrichment.py --ids-file reprovados.json --seed-offset 100`;
  dlg.showModal();
}}
function limpar() {{ if (confirm("Desmarcar todos?")) {{ bad.clear(); save(); render(); }} }}
q.oninput = f.onchange = render;
render();
</script></body></html>"""
    REVIEW_HTML.write_text(doc, encoding="utf-8")
    return REVIEW_HTML


# ----------------------------------------------------------------------------- execução
def stable_seed(food_id: str, offset: int = 0) -> int:
    return (int(hashlib.sha256(food_id.encode()).hexdigest()[:8], 16) + offset) & 0x7FFFFFFF


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-missing", action="store_true", help="processa apenas alimentos novos sem miniatura (nunca sobrescreve existentes)")
    ap.add_argument("--pilot", action="store_true", help="gera apenas os 5 alimentos difíceis + piloto_local.html")
    ap.add_argument("--gerar-revisao", action="store_true", help="apenas regera scratch/thumbnails/revisao_local.html")
    ap.add_argument("--limit", type=int, help="limita a quantidade de itens processados nesta execução")
    ap.add_argument("--ids", help="IDs separados por vírgula para gerar/reprocessar")
    ap.add_argument("--ids-file", type=Path, help="arquivo JSON ou texto com IDs")
    ap.add_argument("--seed-offset", type=int, default=0)
    ap.add_argument("--size", type=int, default=GEN_SIZE, help=f"resolução intermediária de geração (padrão {GEN_SIZE})")
    ap.add_argument("--steps", type=int, default=GEN_STEPS, help=f"passos de difusão (padrão {GEN_STEPS})")
    ap.add_argument("--batch-size", type=int, default=8, help="tamanho do lote de commit/pipeline assíncrono (padrão 8)")
    ap.add_argument("--workers", type=int, default=2, help="threads CPU para resize+WebP em paralelo à GPU (padrão 2)")
    ap.add_argument("--cache-mode", default="", help="cache DiT opcional do sd-server (ex.: easycache)")
    ap.add_argument("--cache-option", default="", help="parâmetros opcionais do cache (ex.: threshold=0.20)")
    ap.add_argument("--port", type=int, default=18765)
    ap.add_argument("--server-url", help="URL de um sd-server já em execução")
    ap.add_argument("--dry-run", action="store_true", default=os.getenv("DRY_RUN") == "1")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.pilot:
        PILOT_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    ids = [i.strip() for i in args.ids.split(",") if i.strip()] if args.ids else None
    if args.ids_file:
        raw_ids = args.ids_file.read_text(encoding="utf-8").strip()
        ids = json.loads(raw_ids) if raw_ids.startswith("[") else [l.strip() for l in raw_ids.splitlines() if l.strip()]

    results = []
    if REPORT_FILE.exists():
        try:
            results = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
        except Exception:
            results = []
    results_by_id = {r["id"]: r for r in results}

    conn = connect()
    if args.gerar_revisao:
        out = render_review_html(conn, results_by_id)
        LOG.info(f"HTML de revisão atualizado: {out}")
        conn.close()
        return 0

    cur = conn.cursor()
    used_digests = load_used_digests(cur)
    # Também protege qualquer arquivo .webp já existente no disco contra colisão/sobrescrita
    used_digests.update(p.stem for p in OUT_DIR.glob("*.webp"))
    old_urls = {}
    if ids and not args.dry_run and not args.only_missing:
        binds = ",".join(f":{i}" for i in range(len(ids)))
        cur.execute(f"SELECT {ID_COL}, {URL_COL} FROM {TABLE} WHERE {ID_COL} IN ({binds})", ids)
        old_urls = {str(r[0]): r[1] for r in cur.fetchall() if r[1]}
    rows = fetch_rows(
        cur,
        limit=args.limit,
        ids=ids,
        names=PILOT_FOODS if args.pilot else None,
        only_missing=args.only_missing,
    )
    cur.close()

    commit_batch = 1 if (ids and not args.only_missing) else max(1, int(args.batch_size))
    deferred_unlink: list[Path] = []
    LOG.info(
        f"Fila: {len(rows)} alimentos | only_missing={args.only_missing} | limit={args.limit} | "
        f"modelo={MODEL_NAME} | {args.size}x{args.size} ({args.steps} passos) | "
        f"async_workers={args.workers} | commit_batch={commit_batch} | dry_run={args.dry_run}"
    )
    if not rows:
        LOG.info("Nenhum alimento pendente.")
        render_review_html(conn, results_by_id)
        conn.close()
        return 0

    t_start = time.monotonic()
    t_gpu_start = t_start
    processed = 0
    collisions: list[tuple[str, str, str, str, int]] = []
    writer_error: list[BaseException] = []
    work_q: queue.Queue = queue.Queue(maxsize=max(4, commit_batch * 2))

    def _write_webp_atomic(target: Path, payload: bytes) -> None:
        if not payload:
            raise ValueError(f"WebP vazio para {target.name}")
        tmp = target.with_suffix(".webp.tmp")
        tmp.write_bytes(payload)
        os.replace(tmp, target)

    def persist_writer():
        nonlocal processed
        pending_db = 0
        wcur = conn.cursor()
        try:
            while True:
                item = work_q.get()
                if item is None:
                    work_q.task_done()
                    break
                idx, food_id, nome, cat, prompt, seed, gen_s, png_bytes, webp_fut = item
                try:
                    webp_bytes, q = webp_fut.result()
                    digest = hashlib.sha256(webp_bytes).hexdigest()[:20]
                    if digest in used_digests or (OUT_DIR / f"{digest}.webp").exists():
                        collisions.append((food_id, nome, cat, prompt, seed + 1))
                        LOG.warning(f"[{idx}/{len(rows)}] Colisão de digest para {nome}; reagendado com seed {seed + 1}.")
                        continue

                    url = f"{URL_PREFIX}/{digest}.webp"
                    if not args.dry_run:
                        _write_webp_atomic(OUT_DIR / f"{digest}.webp", webp_bytes)
                        if args.pilot:
                            (PILOT_PREVIEWS_DIR / f"{food_id}.png").write_bytes(png_bytes)
                        wcur.execute(
                            f"UPDATE {TABLE} SET {URL_COL} = :u, UPDATED_AT = SYSTIMESTAMP WHERE {ID_COL} = :i",
                            u=url,
                            i=food_id,
                        )
                        pending_db += 1
                        if pending_db >= commit_batch or args.pilot:
                            conn.commit()
                            pending_db = 0
                        old_url = old_urls.get(food_id)
                        if old_url and old_url != url and not args.only_missing:
                            old_dg = Path(old_url).stem
                            used_digests.discard(old_dg)
                            deferred_unlink.append(OUT_DIR / f"{old_dg}.webp")

                    used_digests.add(digest)
                    processed += 1

                    kb = len(webp_bytes) / 1024
                    faixa = "OK" if MIN_KB <= kb <= MAX_KB else "FORA_DA_FAIXA"
                    entry = {
                        "id": food_id, "nome": nome, "categoria": cat, "url": url, "digest": digest,
                        "kb": round(kb, 2), "quality": q, "faixa": faixa, "gen_s": round(gen_s, 2),
                        "seed": seed, "prompt": prompt,
                    }
                    results_by_id[food_id] = entry
                    LOG.info(f"[{idx}/{len(rows)}] {nome} -> {url} | {kb:.2f} KB (q={q}, {faixa}) | {gen_s:.2f}s")

                    if processed % max(10, commit_batch * 2) == 0 or args.pilot or (ids and not args.only_missing):
                        REPORT_FILE.write_text(json.dumps(list(results_by_id.values()), ensure_ascii=False, indent=1), encoding="utf-8")
                finally:
                    work_q.task_done()
            if pending_db > 0 and not args.dry_run:
                conn.commit()
        except BaseException as exc:
            writer_error.append(exc)
            try:
                if pending_db > 0 and not args.dry_run:
                    conn.commit()
            except Exception:
                pass
        finally:
            wcur.close()

    try:
        with LocalDiffusionServer(
            port=args.port,
            external_url=args.server_url,
            size=args.size,
            steps=args.steps,
            cache_mode=args.cache_mode,
            cache_option=args.cache_option,
        ) as srv:
            t_gpu_start = time.monotonic()
            writer_thread = threading.Thread(target=persist_writer, name="webp-oracle-writer", daemon=False)
            writer_thread.start()
            try:
                with ThreadPoolExecutor(max_workers=max(1, int(args.workers))) as pool:
                    for idx, (food_id, nome, cat) in enumerate(rows, 1):
                        if writer_error or not writer_thread.is_alive():
                            break
                        food_id, nome, cat = str(food_id), str(nome), str(cat or "Geral")
                        prompt = build_prompt(nome, cat)
                        seed = stable_seed(food_id, args.seed_offset)
                        t0 = time.monotonic()
                        png_bytes = srv.generate(prompt, seed)
                        gen_s = time.monotonic() - t0
                        webp_fut = pool.submit(make_webp, png_bytes)
                        while writer_thread.is_alive():
                            try:
                                work_q.put((idx, food_id, nome, cat, prompt, seed, gen_s, png_bytes, webp_fut), timeout=1.0)
                                break
                            except queue.Full:
                                continue
            finally:
                while writer_thread.is_alive():
                    try:
                        work_q.put(None, timeout=1.0)
                        break
                    except queue.Full:
                        continue
                writer_thread.join()

            if writer_error:
                raise writer_error[0]

            # Fallback síncrono extremamente raro apenas se houver colisão de digest SHA-256
            for food_id, nome, cat, prompt, seed in collisions:
                while True:
                    t0 = time.monotonic()
                    png_bytes = srv.generate(prompt, seed)
                    gen_s = time.monotonic() - t0
                    webp_bytes, q = make_webp(png_bytes)
                    digest = hashlib.sha256(webp_bytes).hexdigest()[:20]
                    if digest not in used_digests and not (OUT_DIR / f"{digest}.webp").exists():
                        break
                    seed += 1
                url = f"{URL_PREFIX}/{digest}.webp"
                if not args.dry_run:
                    _write_webp_atomic(OUT_DIR / f"{digest}.webp", webp_bytes)
                    set_url(conn, food_id, url)
                    old_url = old_urls.get(food_id)
                    if old_url and old_url != url and not args.only_missing:
                        old_dg = Path(old_url).stem
                        used_digests.discard(old_dg)
                        deferred_unlink.append(OUT_DIR / f"{old_dg}.webp")
                used_digests.add(digest)
                processed += 1
                kb = len(webp_bytes) / 1024
                faixa = "OK" if MIN_KB <= kb <= MAX_KB else "FORA_DA_FAIXA"
                results_by_id[food_id] = {
                    "id": food_id, "nome": nome, "categoria": cat, "url": url, "digest": digest,
                    "kb": round(kb, 2), "quality": q, "faixa": faixa, "gen_s": round(gen_s, 2),
                    "seed": seed, "prompt": prompt,
                }
                LOG.info(f"[retry] {nome} -> {url} | {kb:.2f} KB (q={q}, {faixa}) | {gen_s:.2f}s")
    finally:
        REPORT_FILE.write_text(json.dumps(list(results_by_id.values()), ensure_ascii=False, indent=1), encoding="utf-8")
        if not args.pilot:
            render_review_html(conn, results_by_id)
        for old_path in deferred_unlink:
            old_path.unlink(missing_ok=True)

    total_s = time.monotonic() - t_start
    gen_wall_s = time.monotonic() - t_gpu_start
    avg_s = gen_wall_s / max(1, processed)

    if args.pilot:
        render_html([results_by_id[str(r[0])] for r in rows if str(r[0]) in results_by_id], PILOT_HTML, "Piloto Local GPU (5 alimentos) - Clínica FAAZ", pilot=True)
        LOG.info(f"PILOTO CONCLUÍDO em {total_s:.1f}s (média efetiva {avg_s:.2f}s/img). HTML: {PILOT_HTML}")
    else:
        LOG.info(
            f"CARGA CONCLUÍDA: {processed} imagens em {total_s/60:.2f} min "
            f"(tempo geração={gen_wall_s:.1f}s, média efetiva {avg_s:.2f}s/img). HTML: {REVIEW_HTML}"
        )

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
