/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Button, Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, button, footer, text } from './theme.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Reset your password for ${siteName}`}
    kickerText="Security"
    heading="Reset your password"
    note={
      <Text style={footer}>
        If you didn&apos;t request a password reset, you can safely ignore this email — your password will
        not be changed.
      </Text>
    }
  >
    <Text style={text}>
      We received a request to reset the password for your {siteName} account. Choose a new one below.
      This link expires shortly, for your security.
    </Text>
    <Button className="dm-btn" style={button} href={confirmationUrl}>
      Choose a new password
    </Button>
  </EmailShell>
)

export default RecoveryEmail
