/**
 * The HTML shell for the web target only. Native is unaffected by this file.
 *
 * It exists to paint the document itself in `page`. Without it the browser's own
 * white background sits under the app, which shows through anywhere the React tree
 * is transparent — most visibly behind the §6.3 sheet's scrim, which is a
 * translucent `pageDeep` and composited to grey rather than to dark.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { colors } from '@/theme/tokens';

const rootBackground = `
  html, body, #root {
    background-color: ${colors.page};
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Keeps body scroll from fighting the app's own ScrollViews. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: rootBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
