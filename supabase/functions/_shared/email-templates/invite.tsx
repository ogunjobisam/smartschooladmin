/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Button, Link, Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, button, footer, link, text } from './theme.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <EmailShell
    siteName={siteName}
    preview={`You've been invited to join ${siteName}`}
    kickerText="Invitation"
    heading="You’ve been invited"
    note={
      <Text style={footer}>
        If you weren&apos;t expecting this invitation, you can safely ignore this email.
      </Text>
    }
  >
    <Text style={text}>
      You&apos;ve been invited to join{' '}
      <Link href={siteUrl} style={link}>
        <strong>{siteName}</strong>
      </Link>
      . Accept the invitation to set your password and get started.
    </Text>
    <Button className="dm-btn" style={button} href={confirmationUrl}>
      Accept invitation
    </Button>
  </EmailShell>
)

export default InviteEmail
