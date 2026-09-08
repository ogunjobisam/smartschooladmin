/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Button, Link, Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, button, footer, link, text } from './theme.tsx'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Confirm your email change for ${siteName}`}
    kickerText="Security"
    heading="Confirm your email change"
    note={
      <Text style={footer}>
        If you didn&apos;t request this change, please secure your account immediately.
      </Text>
    }
  >
    <Text style={text}>
      You asked to change the email address on your {siteName} account from{' '}
      <Link href={`mailto:${oldEmail}`} style={link}>
        {oldEmail}
      </Link>{' '}
      to{' '}
      <Link href={`mailto:${newEmail}`} style={link}>
        {newEmail}
      </Link>
      .
    </Text>
    <Button className="dm-btn" style={button} href={confirmationUrl}>
      Confirm the change
    </Button>
  </EmailShell>
)

export default EmailChangeEmail
