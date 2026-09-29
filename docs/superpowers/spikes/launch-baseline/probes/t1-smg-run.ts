import { readFileSync, writeFileSync } from 'node:fs'
import { generateMetadata } from './metadata.ts'
import { getDefaultAlgorithms } from './algorithms.ts'
const ids = (c: string) => getDefaultAlgorithms(c as never).map((a) => a.uri ?? (a as { value?: string }).value ?? (a as { id?: string }).id)
const xml = generateMetadata({
  appName: 'lp-sample', appUrl: 'https://lp-sample.manifest.internal',
  orgName: 'University of British Columbia', orgDisplayName: 'University of British Columbia', orgUrl: 'https://www.ubc.ca',
  contactEmail: 'owner@example.ubc.ca', certificate: readFileSync('cert.pem', 'utf8'),
  digestMethods: ids('digest'), signingMethods: ids('signing'), encryptionMethods: ids('encryption'),
})
writeFileSync('ubc-structure.xml', xml)
console.log(JSON.stringify({ digest: ids('digest'), signing: ids('signing'), encryption: ids('encryption') }))
