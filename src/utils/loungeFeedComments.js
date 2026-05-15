/**
 * Build a comment forest for a post (roots = `parent_id` null), children sorted oldest-first.
 * @param {Array<{ id: string, parent_id?: string | null, created_at?: string, [key: string]: unknown }>} rows
 */
export function buildLoungeCommentForest(rows) {
  const byId = new Map()
  const roots = []
  for (const row of rows || []) {
    if (!row?.id) continue
    byId.set(row.id, { ...row, children: [] })
  }
  for (const row of rows || []) {
    if (!row?.id) continue
    const node = byId.get(row.id)
    if (!node) continue
    const pid = row.parent_id
    if (pid && byId.has(pid)) {
      byId.get(pid).children.push(node)
    } else if (!pid) {
      roots.push(node)
    }
  }
  const sortKids = (nodes) => {
    nodes.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    for (const n of nodes) sortKids(n.children)
  }
  sortKids(roots)
  return roots
}

/** Total descendants (not including `node`). */
export function loungeCommentDescendantCount(node) {
  if (!node?.children?.length) return 0
  return node.children.reduce((acc, c) => acc + 1 + loungeCommentDescendantCount(c), 0)
}

/**
 * All comments by `postAuthorUserId` in `node`'s subtree (not including `node` itself).
 * @returns {Array<{ comment: object, parent: object | null }>}
 */
export function loungeCommentOpRepliesInSubtree(node, postAuthorUserId) {
  const out = []
  if (!node?.children?.length || !postAuthorUserId) return out
  const walk = (parent) => {
    for (const child of parent.children) {
      if (child.user_id === postAuthorUserId) {
        out.push({ comment: child, parent })
      }
      walk(child)
    }
  }
  walk(node)
  return out
}

/** Top-level root id for a comment in a flat list (by id). */
export function loungeCommentRootId(commentId, flatById) {
  if (!commentId) return null
  let cur = flatById.get(commentId)
  if (!cur) return commentId
  while (cur.parent_id && flatById.has(cur.parent_id)) {
    cur = flatById.get(cur.parent_id)
  }
  return cur?.id ?? commentId
}
