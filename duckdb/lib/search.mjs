import { allSql } from './db.mjs';
import { sqlStringLiteral, tokenizeQuery } from './utils.mjs';

function sourceWeightSql() {
  return `
  CASE source_group
    WHEN 'scripts_sanitized' THEN 100
    WHEN 'script_stubs' THEN 90
    WHEN 'scripts' THEN 80
    WHEN 'docs_filemaker' THEN 60
    WHEN 'docs_mbs' THEN 50
    ELSE 40
  END
  `;
}

export async function searchDocuments({
  db,
  solutionName,
  query,
  source = 'all',
  limit = 10,
}) {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return [];
  }

  const tokenScoreParts = tokens.map(
    (token) => `CASE WHEN lower(text) LIKE ${sqlStringLiteral(`%${token}%`)} THEN 1 ELSE 0 END`
  );
  const anyMatch = tokens
    .map((token) => `lower(text) LIKE ${sqlStringLiteral(`%${token}%`)}`)
    .join(' OR ');

  const sourceCondition =
    source === 'all'
      ? '1 = 1'
      : source === 'scripts'
        ? "source_group IN ('scripts_sanitized', 'script_stubs', 'scripts')"
        : source === 'docs'
          ? "source_group IN ('docs_filemaker', 'docs_mbs')"
          : source === 'xml'
            ? "source_group IN ('xml')"
            : '1 = 1';

  const sql = `
    SELECT
      doc_id,
      path,
      source_group,
      title,
      LEFT(REPLACE(REPLACE(text, '\r', ' '), '\n', ' '), 260) AS snippet,
      (${tokenScoreParts.join(' + ')}) * 100 + (${sourceWeightSql()}) AS score
    FROM documents
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND ${sourceCondition}
      AND (${anyMatch})
    ORDER BY score DESC, LENGTH(text) ASC
    LIMIT ${Math.max(1, Math.min(200, Number(limit) || 10))}
  `;

  return allSql(db, sql);
}
