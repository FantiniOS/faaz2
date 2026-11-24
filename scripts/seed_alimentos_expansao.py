#!/usr/bin/env python3
"""
Carga 100% Idempotente da Expansão de Alimentos no Oracle ADB — FRdoc 2.0

TRAVAS DE SEGURANÇA:
- Executa EXCLUSIVAMENTE `INSERT` de alimentos genuinamente novos.
- PROIBIDO `DELETE`, `TRUNCATE`, `DROP` ou `UPDATE` nos alimentos existentes.
- Valida duplicidade antes de inserir tanto por nome exato quanto por nome
  normalizado (sem acentos, pontuação ou medida caseira entre parênteses).
- Registra os IDs inseridos em `scratch/thumbnails/novos_ids_expansao.json`
  para o filtro "Só novos (desta rodada)" em `revisao_local.html`.

Uso:
  python scripts/seed_alimentos_expansao.py --dry-run   # simula sem gravar
  python scripts/seed_alimentos_expansao.py             # executa INSERT idempotente
"""
import argparse
import json
import os
import re
import sys
import unicodedata
import uuid
from collections import Counter
from pathlib import Path

import oracledb
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from alimentos_expansao_data import (
    BASE_TBCA_POF_COMPLEMENTAR,
    PACOTE_CLINICO_MODERNO,
)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

NOVOS_IDS_FILE = ROOT / "scratch" / "thumbnails" / "novos_ids_expansao.json"


def normalize_name(text: str) -> str:
    s = unicodedata.normalize("NFD", (text or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_base_name(text: str) -> str:
    return normalize_name(re.sub(r"\(.*?\)", "", text or ""))


def connect_oracle():
    return oracledb.connect(
        user=os.getenv("ORACLE_USER") or os.environ["DATABASE_USER"],
        password=os.getenv("ORACLE_PASSWORD") or os.environ["DATABASE_PASSWORD"],
        dsn=(os.getenv("ORACLE_DSN") or os.environ["DATABASE_URL"]).strip('"'),
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Carga idempotente de novos alimentos no Oracle")
    ap.add_argument("--dry-run", action="store_true", help="Simula a carga sem gravar no banco")
    args = ap.parse_args()

    catalogo = [*PACOTE_CLINICO_MODERNO, *BASE_TBCA_POF_COMPLEMENTAR]
    conn = connect_oracle()
    cur = conn.cursor()

    # 1. Auditoria do estado atual (somente leitura)
    cur.execute("SELECT ID, NOME, CATEGORIA, FONTE FROM ALIMENTOS")
    existentes = cur.fetchall()
    total_antes = len(existentes)
    cats_antes = Counter((r[2] or "Geral") for r in existentes)

    seen_exact: set[str] = set()
    seen_norm: set[str] = set()
    seen_base: set[str] = set()
    for _id, nome, _cat, _fonte in existentes:
        nome_s = str(nome or "").strip()
        seen_exact.add(nome_s.lower())
        seen_norm.add(normalize_name(nome_s))
        seen_base.add(normalize_base_name(nome_s))

    to_insert: list[tuple] = []
    skipped: list[tuple[str, str]] = []

    for nome, cat, kcal, prot, carb, gord, fib, fonte in catalogo:
        nome_clean = re.sub(r"\s+", " ", nome).strip()
        n_exact = nome_clean.lower()
        n_norm = normalize_name(nome_clean)
        n_base = normalize_base_name(nome_clean)

        if n_exact in seen_exact or n_norm in seen_norm or n_base in seen_base:
            skipped.append((nome_clean, "duplicata"))
            continue

        # Validação nutricional defensiva
        if any(float(v) < 0 for v in (kcal, prot, carb, gord, fib)):
            skipped.append((nome_clean, "valor_negativo"))
            continue

        new_id = str(uuid.uuid4())
        to_insert.append(
            (
                new_id,
                nome_clean,
                100.0,
                round(float(kcal), 1),
                round(float(prot), 1),
                round(float(carb), 1),
                round(float(gord), 1),
                round(float(fib), 1),
                cat.strip(),
                fonte.strip(),
            )
        )
        seen_exact.add(n_exact)
        seen_norm.add(n_norm)
        seen_base.add(n_base)

    print(f"=== AUDITORIA PRÉ-CARGA ===")
    print(f"Total já existente no Oracle: {total_antes}")
    print(f"Candidatos no catálogo:       {len(catalogo)}")
    print(f"Novos genuínos para INSERT:   {len(to_insert)}")
    print(f"Ignorados (já existentes):    {len(skipped)}")

    if args.dry_run:
        print("\n[DRY-RUN] Nenhuma linha foi inserida.")
        cur.close()
        conn.close()
        return 0

    inserted_ids: list[str] = []
    insert_sql = """
        INSERT INTO ALIMENTOS (
            ID, NOME, PORCAO_BASE, CALORIAS, PROTEINAS, CARBOIDRATOS,
            GORDURAS, FIBRAS, CATEGORIA, FONTE, CREATED_AT, UPDATED_AT, THUMBNAILURL
        ) VALUES (
            :1, :2, :3, :4, :5, :6,
            :7, :8, :9, :10, SYSTIMESTAMP, SYSTIMESTAMP, NULL
        )
    """

    # Insere em lotes seguros com proteção adicional contra ORA-00001
    batch_size = 100
    for start in range(0, len(to_insert), batch_size):
        chunk = to_insert[start : start + batch_size]
        try:
            cur.executemany(insert_sql, chunk)
            conn.commit()
            inserted_ids.extend(row[0] for row in chunk)
        except oracledb.IntegrityError:
            conn.rollback()
            # Fallback item a item para manter 100% de idempotência
            for row in chunk:
                try:
                    cur.execute(insert_sql, row)
                    conn.commit()
                    inserted_ids.append(row[0])
                except oracledb.IntegrityError:
                    conn.rollback()
                    skipped.append((row[1], "ora_00001"))

    # Persiste IDs novos em scratch/thumbnails/novos_ids_expansao.json (acumulativo)
    NOVOS_IDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    prev_ids: list[str] = []
    if NOVOS_IDS_FILE.exists():
        try:
            prev_ids = json.loads(NOVOS_IDS_FILE.read_text(encoding="utf-8"))
        except Exception:
            prev_ids = []
    merged_ids = list(dict.fromkeys([*prev_ids, *inserted_ids]))
    NOVOS_IDS_FILE.write_text(
        json.dumps(merged_ids, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Relatório pós-carga direto do Oracle
    cur.execute("SELECT CATEGORIA, COUNT(*) FROM ALIMENTOS GROUP BY CATEGORIA ORDER BY COUNT(*) DESC, CATEGORIA")
    cats_depois = dict(cur.fetchall())
    cur.execute("SELECT COUNT(*) FROM ALIMENTOS")
    total_depois = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM ALIMENTOS WHERE THUMBNAILURL IS NULL")
    sem_thumb = cur.fetchone()[0]
    cur.execute("SELECT FONTE, COUNT(*) FROM ALIMENTOS GROUP BY FONTE ORDER BY COUNT(*) DESC")
    fontes_depois = cur.fetchall()

    print(f"\n=== RESULTADO PÓS-CARGA ORACLE ===")
    print(f"Total ANTES:           {total_antes}")
    print(f"Inseridos nesta carga: {len(inserted_ids)}")
    print(f"Total DEPOIS:          {total_depois}")
    print(f"Pendentes de thumb:    {sem_thumb}")
    print(f"IDs novos salvos em:   {NOVOS_IDS_FILE} ({len(merged_ids)} IDs)")

    print("\n=== POR FONTE ===")
    for fonte, qtd in fontes_depois:
        print(f"  {fonte}: {qtd}")

    print("\n=== POR CATEGORIA (ANTES -> DEPOIS) ===")
    all_cats = sorted(set(cats_antes.keys()) | set(cats_depois.keys()), key=lambda c: -cats_depois.get(c, 0))
    for cat in all_cats:
        a = cats_antes.get(cat, 0)
        d = cats_depois.get(cat, 0)
        diff = d - a
        sign = f"+{diff}" if diff > 0 else str(diff)
        print(f"  {cat}: {a} -> {d} ({sign})")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
