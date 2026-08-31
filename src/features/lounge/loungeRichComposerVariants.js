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
    fieldClass: `${LOUNGE_FEED_CAPTION_TEXT_CLASS} min-h-[2.75rem] max-h-[min(50vh,22rem)] pt-[10px] sm:min-h-[3rem] sm:pt-[13px]`,
    placeholderClass: 'pt-[10px] text-[17px] leading-[1.25] sm:pt-[13px]',
  },
  detailComment: {
    fieldClass:
      'min-h-[38px] max-h-[min(42vh,22rem)] py-1 text-[17px] leading-[1.3] [transform:translateZ(0)]',
    placeholderClass: 'py-1 text-[17px] leading-[1.3]',
  },
  detailCommentEdit: {
    fieldClass:
      'min-h-[38px] max-h-[min(42vh,22rem)] py-1 text-[17px] leading-[1.3] [transform:translateZ(0)]',
    placeholderClass: 'py-1 text-[17px] leading-[1.3]',
  },
  fullscreen: {
    fieldClass:
      'min-h-[14rem] sm:min-h-[20rem] p-3 sm:p-4 text-[17px] sm:text-[18px] leading-relaxed [overflow-wrap:anywhere]',
    placeholderClass:
      'p-3 sm:p-4 text-[17px] sm:text-[18px] leading-relaxed',
  },
}
