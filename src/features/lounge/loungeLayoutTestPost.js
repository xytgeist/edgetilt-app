export const LOUNGE_LAYOUT_TEST_POST_ID = '__lounge_layout_test__'

/** Sentinel post row — opens real post-detail chrome without feed fetch or comments. */
export const LOUNGE_LAYOUT_TEST_POST = Object.freeze({
  id: LOUNGE_LAYOUT_TEST_POST_ID,
  caption: '',
  game_title: null,
  game_slug: null,
  category_pills: [],
  user_id: null,
  created_at: '1970-01-01T00:00:00.000Z',
  edited_at: null,
  pinned: false,
  like_count: 0,
  comment_count: 0,
  repost_count: 0,
  repost_of_post_id: null,
  repost_of_comment_id: null,
  is_plain_repost: false,
  repost_target_unavailable: false,
  media_url: null,
  gif_url: null,
  image_urls: [],
  stream_video_uid: null,
  stream_poster_url: null,
  stream_video_width: null,
  stream_video_height: null,
  is_ap_guide_post: false,
  guide_thumbnail_url: null,
  author_profile: {
    handle: 'layout-test',
    display_name: 'Layout test',
    avatar_url: null,
    role: null,
    is_og: false,
  },
})

/** @param {string | null | undefined} postId */
export function isLoungeLayoutTestPostId(postId) {
  return String(postId || '') === LOUNGE_LAYOUT_TEST_POST_ID
}
