{{/*
Expand the name of the chart.
*/}}
{{- define "myelectricaldata.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "myelectricaldata.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "myelectricaldata.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "myelectricaldata.labels" -}}
helm.sh/chart: {{ include "myelectricaldata.chart" . }}
{{ include "myelectricaldata.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "myelectricaldata.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myelectricaldata.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "myelectricaldata.backend.labels" -}}
{{ include "myelectricaldata.labels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{- define "myelectricaldata.backend.selectorLabels" -}}
{{ include "myelectricaldata.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "myelectricaldata.frontend.labels" -}}
{{ include "myelectricaldata.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{- define "myelectricaldata.frontend.selectorLabels" -}}
{{ include "myelectricaldata.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "myelectricaldata.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "myelectricaldata.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Backend fullname
*/}}
{{- define "myelectricaldata.backend.fullname" -}}
{{- printf "%s-backend" (include "myelectricaldata.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Frontend fullname
*/}}
{{- define "myelectricaldata.frontend.fullname" -}}
{{- printf "%s-frontend" (include "myelectricaldata.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Valkey fullname - CloudPirates subchart uses release-name-valkey
*/}}
{{- define "myelectricaldata.valkey.fullname" -}}
{{- printf "%s-valkey" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL fullname - CloudPirates subchart uses release-name-postgres
*/}}
{{- define "myelectricaldata.postgres.fullname" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Valkey host
*/}}
{{- define "myelectricaldata.valkey.host" -}}
{{- if .Values.valkey.enabled }}
{{- include "myelectricaldata.valkey.fullname" . }}
{{- else }}
{{- .Values.externalValkey.host }}
{{- end }}
{{- end }}

{{/*
Valkey port
*/}}
{{- define "myelectricaldata.valkey.port" -}}
{{- if .Values.valkey.enabled }}
{{- .Values.valkey.service.port | default 6379 }}
{{- else }}
{{- .Values.externalValkey.port }}
{{- end }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "myelectricaldata.postgres.host" -}}
{{- if .Values.postgres.enabled }}
{{- include "myelectricaldata.postgres.fullname" . }}
{{- else }}
{{- .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{/*
PostgreSQL port
*/}}
{{- define "myelectricaldata.postgres.port" -}}
{{- if .Values.postgres.enabled }}
{{- .Values.postgres.service.port | default 5432 }}
{{- else }}
{{- .Values.externalDatabase.port }}
{{- end }}
{{- end }}

{{/*
PostgreSQL database
*/}}
{{- define "myelectricaldata.postgres.database" -}}
{{- if .Values.postgres.enabled }}
{{- .Values.postgres.auth.database }}
{{- else }}
{{- .Values.externalDatabase.database }}
{{- end }}
{{- end }}

{{/*
PostgreSQL username
*/}}
{{- define "myelectricaldata.postgres.username" -}}
{{- if .Values.postgres.enabled }}
{{- .Values.postgres.auth.username }}
{{- else }}
{{- .Values.externalDatabase.username }}
{{- end }}
{{- end }}

{{/*
Database URL - uses POSTGRES_PASSWORD env var for the password
*/}}
{{- define "myelectricaldata.databaseUrl" -}}
{{- $host := include "myelectricaldata.postgres.host" . -}}
{{- $port := include "myelectricaldata.postgres.port" . -}}
{{- $database := include "myelectricaldata.postgres.database" . -}}
{{- $username := include "myelectricaldata.postgres.username" . -}}
postgresql+asyncpg://{{ $username }}:$(POSTGRES_PASSWORD)@{{ $host }}:{{ $port }}/{{ $database }}
{{- end }}

{{/*
Valkey secret name - Supports external secrets or subchart-generated secrets
*/}}
{{- define "myelectricaldata.valkey.secretName" -}}
{{- if .Values.valkey.enabled }}
  {{- if .Values.valkey.auth.existingSecret }}
    {{- .Values.valkey.auth.existingSecret }}
  {{- else }}
    {{- printf "%s-valkey" .Release.Name }}
  {{- end }}
{{- else if .Values.externalValkey.existingSecret }}
  {{- .Values.externalValkey.existingSecret }}
{{- else }}
  {{- printf "%s-external-valkey" (include "myelectricaldata.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Valkey secret key - Returns the key name for the password in the secret
CloudPirates Valkey chart uses 'password' as the default key
*/}}
{{- define "myelectricaldata.valkey.secretKey" -}}
{{- if .Values.valkey.enabled }}
  {{- if .Values.valkey.auth.existingSecret }}
    {{- .Values.valkey.auth.existingSecretPasswordKey | default "password" }}
  {{- else }}
    {{- "password" }}
  {{- end }}
{{- else }}
  {{- "password" }}
{{- end }}
{{- end }}

{{/*
Valkey URL - uses VALKEY_PASSWORD env var for the password (protocol remains redis://)
*/}}
{{- define "myelectricaldata.valkeyUrl" -}}
{{- $host := include "myelectricaldata.valkey.host" . -}}
{{- $port := include "myelectricaldata.valkey.port" . -}}
redis://:$(VALKEY_PASSWORD)@{{ $host }}:{{ $port }}/0
{{- end }}

{{/*
Image pull secrets
*/}}
{{- define "myelectricaldata.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/*
PostgreSQL secret name - Supports external secrets or subchart-generated secrets
*/}}
{{- define "myelectricaldata.postgres.secretName" -}}
{{- if .Values.postgres.enabled }}
  {{- if .Values.postgres.auth.existingSecret }}
    {{- .Values.postgres.auth.existingSecret }}
  {{- else }}
    {{- printf "%s-postgres" .Release.Name }}
  {{- end }}
{{- else if .Values.externalDatabase.existingSecret }}
  {{- .Values.externalDatabase.existingSecret }}
{{- else }}
  {{- printf "%s-external-db" (include "myelectricaldata.fullname" .) }}
{{- end }}
{{- end }}

{{/*
PostgreSQL secret key - Returns the key name for the password in the secret
*/}}
{{- define "myelectricaldata.postgres.secretKey" -}}
{{- if .Values.postgres.enabled }}
  {{- if .Values.postgres.auth.existingSecret }}
    {{- .Values.postgres.auth.existingSecretKey | default "password" }}
  {{- else }}
    {{- "postgres-password" }}
  {{- end }}
{{- else }}
  {{- "password" }}
{{- end }}
{{- end }}

{{/*
Application secret name - uses existingSecret if provided, otherwise creates one
*/}}
{{- define "myelectricaldata.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "myelectricaldata.fullname" . }}
{{- end }}
{{- end }}

{{/*
Helper to check if any secret uses an external reference
Returns "true" if at least one secret uses existingSecretRef
*/}}
{{- define "myelectricaldata.hasExternalSecrets" -}}
{{- if or .Values.secrets.secretKey.existingSecretRef.name .Values.secrets.adminEmails.existingSecretRef.name .Values.secrets.enedis.clientId.existingSecretRef.name .Values.secrets.enedis.clientSecret.existingSecretRef.name .Values.secrets.rte.clientId.existingSecretRef.name .Values.secrets.rte.clientSecret.existingSecretRef.name .Values.secrets.mailgun.apiKey.existingSecretRef.name .Values.secrets.mailgun.domain.existingSecretRef.name .Values.secrets.mailgun.fromEmail.existingSecretRef.name .Values.secrets.turnstile.secretKey.existingSecretRef.name -}}
true
{{- end }}
{{- end }}

{{/*
Helper to check if we can use envFrom (legacy mode - single secret for all)
Returns "true" if using legacy existingSecret or all secrets are inline
*/}}
{{- define "myelectricaldata.useEnvFrom" -}}
{{- if .Values.secrets.existingSecret -}}
true
{{- else if not (include "myelectricaldata.hasExternalSecrets" .) -}}
true
{{- end }}
{{- end }}

{{/*
Get secret name for a specific secret field
Usage: {{ include "myelectricaldata.secretRef.name" (dict "root" . "secretConfig" .Values.secrets.secretKey "defaultKey" "SECRET_KEY") }}
*/}}
{{- define "myelectricaldata.secretRef.name" -}}
{{- if .secretConfig.existingSecretRef.name -}}
{{- .secretConfig.existingSecretRef.name -}}
{{- else if .root.Values.secrets.existingSecret -}}
{{- .root.Values.secrets.existingSecret -}}
{{- else -}}
{{- include "myelectricaldata.fullname" .root -}}
{{- end -}}
{{- end -}}

{{/*
Get secret key for a specific secret field
Usage: {{ include "myelectricaldata.secretRef.key" (dict "secretConfig" .Values.secrets.secretKey "defaultKey" "SECRET_KEY") }}
*/}}
{{- define "myelectricaldata.secretRef.key" -}}
{{- if .secretConfig.existingSecretRef.key -}}
{{- .secretConfig.existingSecretRef.key -}}
{{- else -}}
{{- .defaultKey -}}
{{- end -}}
{{- end -}}
