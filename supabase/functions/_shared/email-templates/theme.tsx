/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

/**
 * One look for every account email SmartSchool Admin sends.
 *
 * Sign-in, invitation and password emails all arrive in the same inbox as the
 * school's own alerts, so they share the same shape: a coloured header band with
 * the product mark, a white card, one clear action, and a quiet footer. Styles are
 * inline constants because email clients ignore stylesheets.
 */

export const BRAND = '#0f172a'
export const ACCENT = '#3b82f6'

export const main = {
  margin: '0',
  padding: '24px 12px',
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
}

export const card = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '0',
  border: '1px solid #e6ebf1',
  borderRadius: '16px',
  overflow: 'hidden' as const,
}

const header = {
  backgroundColor: BRAND,
  padding: '20px 26px',
}

const headerRule = { height: '4px', backgroundColor: ACCENT, margin: '0', border: '0' }

const wordmark = {
  margin: '0',
  color: '#ffffff',
  fontSize: '17px',
  fontWeight: 700 as const,
  letterSpacing: '.01em',
}

const inner = { padding: '28px 26px 8px' }

export const kicker = {
  margin: '0 0 6px',
  fontSize: '11px',
  letterSpacing: '.14em',
  textTransform: 'uppercase' as const,
  color: '#94a3b8',
}

export const h1 = {
  fontSize: '22px',
  lineHeight: '1.3',
  fontWeight: 700 as const,
  color: '#0f172a',
  margin: '0 0 16px',
}

export const text = {
  fontSize: '15px',
  lineHeight: '1.65',
  color: '#475569',
  margin: '0 0 16px',
}

export const link = { color: ACCENT, textDecoration: 'underline' }

export const button = {
  display: 'inline-block',
  backgroundColor: BRAND,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  border: `1px solid ${BRAND}`,
  borderRadius: '10px',
  padding: '13px 26px',
  textDecoration: 'none',
  margin: '6px 0 20px',
}

export const codeStyle = {
  display: 'block',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '30px',
  fontWeight: 700 as const,
  letterSpacing: '.22em',
  color: '#0f172a',
  backgroundColor: '#f4f6fa',
  border: '1px solid #e6ebf1',
  borderRadius: '12px',
  padding: '18px',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}

export const footer = {
  fontSize: '12px',
  lineHeight: '1.6',
  color: '#94a3b8',
  margin: '0 0 6px',
}

const footerWrap = { padding: '0 26px 24px' }

// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
export const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #000000 !important; border-color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
`

interface ShellProps {
  siteName: string
  preview: string
  kickerText?: string
  heading: string
  children: React.ReactNode
  /** Small print under the divider. */
  note?: React.ReactNode
}

export const EmailShell = ({ siteName, preview, kickerText, heading, children, note }: ShellProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={card}>
        <Section style={header}>
          <Text style={wordmark}>{siteName}</Text>
        </Section>
        <Hr style={headerRule} />
        <Section style={inner}>
          {kickerText ? <Text style={kicker}>{kickerText}</Text> : null}
          <Heading style={h1}>{heading}</Heading>
          {children}
        </Section>
        {note ? (
          <Section style={footerWrap}>
            <Hr style={{ borderColor: '#e6ebf1', margin: '0 0 14px' }} />
            {note}
          </Section>
        ) : null}
      </Container>
    </Body>
  </Html>
)
