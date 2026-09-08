/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Text } from 'npm:@react-email/components@0.0.22'
import { EmailShell, codeStyle, footer, text } from './theme.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailShell
    siteName="SmartSchool Admin"
    preview="Your verification code"
    kickerText="Security"
    heading="Confirm it’s you"
    note={
      <Text style={footer}>
        This code expires shortly. If you didn&apos;t request it, you can safely ignore this email.
      </Text>
    }
  >
    <Text style={text}>Enter this verification code to continue:</Text>
    <Text style={codeStyle}>{token}</Text>
  </EmailShell>
)

export default ReauthenticationEmail
