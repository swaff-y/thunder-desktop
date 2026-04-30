/**
 * TD-021: JSX type for Electron's `<webview>` tag. Electron ships
 * `WebviewTag` for the imperative API but doesn't augment `JSX.IntrinsicElements`,
 * so React refuses to type-check the element directly. Only the
 * attributes the Browser tab actually uses are declared.
 */

import type { WebviewTag } from 'electron'
import type { DetailedHTMLProps, HTMLAttributes, Ref } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<WebviewTag> & {
          src?: string
          partition?: string
          allowpopups?: string | boolean
          useragent?: string
          webpreferences?: string
          ref?: Ref<WebviewTag>
        },
        WebviewTag
      >
    }
  }
}
