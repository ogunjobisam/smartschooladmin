/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Button, Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, button, footer, text } from './theme.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Your login link for ${siteName}`}
    kickerText="Sign in"
    heading="Your login link"
    note={
      <Text style={footer}>If you didn&apos;t request this link, you can safely ignore this email.</Text>
    }
  >
    <Text style={text}>
      Use the button below to sign in to {siteName}. The link works once and expires shortly.
    </Text>
    <Button className="dm-btn" style={button} href={confirmationUrl}>
      Sign in
    </Button>
  </EmailShell>
)

export default MagicLinkEmail
