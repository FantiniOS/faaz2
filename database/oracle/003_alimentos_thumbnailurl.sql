-- ============================================================================
-- 003 - Miniaturas fotográficas dos alimentos (Motor de Enriquecimento Visual)
-- Coluna preenchida por scripts/thumbnail_enrichment.py com o caminho público
-- do WebP 100x100 (ex.: /food-thumbnails/<sha256>.webp). NULL => fallback emoji.
-- ============================================================================
ALTER TABLE ALIMENTOS ADD (THUMBNAILURL VARCHAR2(500 CHAR));
