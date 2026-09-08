/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Button, Link, Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, button, footer, link, text } from './theme.tsx'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`Confirm your email for ${siteName}`}
    kickerText="Account setup"
    heading="Confirm your email"
    note={
      <Text style={footer}>
        If you didn&apos;t create an account, you can safely ignore this email.
      </Text>
    }
  >
    <Text style={text}>
      Thanks for signing up for{' '}
      <Link href={siteUrl} style={link}>
        <strong>{siteName}</strong>
      </Link>
      . One quick step and you&apos;re in.
    </Text>
    <Text style={text}>
      Confirm that{' '}
      <Link href={`mailto:${recipient}`} style={link}>
        {recipient}
      </Link>{' '}
      is your address:
    </Text>
    <Button className="dm-btn" style={button} href={confirmationUrl}>
      Verify my email
    </Button>
  </EmailShell>
)

export default SignupEmail
