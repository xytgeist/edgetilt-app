import { LOUNGE_FEED_CAPTION_TEXT_CLASS } from './loungeFeedAvatar.js'

/** Layout presets for {@link LoungeRichComposerField} surfaces. */
export const LOUNGE_RICH_COMPOSER_VARIANTS = {
  feed: {
    fieldClass:
      'min-h-[2.75rem] max-h-[min(50vh,22rem)] pt-[10px] text-[17px] leading-[1.25] sm:min-h-[3rem] sm:pt-[13px]',
    placeholderClass: 'pt-[10px] text-[17px] leading-[1.25] sm:pt-[13px]',
  },
  quote: {
    fieldClass:
      'min-h-[2.75rem] max-h-[min(50vh,22rem)] pt-[10px] text-[17px] leading-[1.25] [overflow-wrap:anywhere] sm:min-h-[3rem] sm:pt-[13px]',
    placeholderClass: 'pt-[10px] text-[17px] leading-[1.25] sm:pt-[13px]',
  },
  detailEdit: {
    fieldClass: `min-h-[5rem] ${LOUNGE_FEED_CAPTION_TEXT_CLASS}`,
    placeholderClass: LOUNGE_FEED_CAPTION_TEXT_CLASS,
  },
  detailComment: {
    fieldClass: 'min-h-[38px] py-1 text-[17px] leading-[1.3]',
    placeholderClass: 'py-1 text-[17px] leading-[1.3]',
  },
}
