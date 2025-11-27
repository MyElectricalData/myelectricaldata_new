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
Redis fullname - CloudPirates subchart uses release-name-redis
*/}}
{{- define "myelectricaldata.redis.fullname" -}}
{{- printf "%s-redis" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL fullname - CloudPirates subchart uses release-name-postgres
*/}}
{{- define "myelectricaldata.postgres.fullname" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "myelectricaldata.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- include "myelectricaldata.redis.fullname" . }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "myelectricaldata.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- .Values.redis.service.port | default 6379 }}
{{- else }}
{{- .Values.externalRedis.port }}
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
Redis URL
*/}}
{{- define "myelectricaldata.redisUrl" -}}
{{- $host := include "myelectricaldata.redis.host" . -}}
{{- $port := include "myelectricaldata.redis.port" . -}}
redis://{{ $host }}:{{ $port }}/0
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
PostgreSQL secret name - CloudPirates postgres chart creates secrets
*/}}
{{- define "myelectricaldata.postgres.secretName" -}}
{{- if .Values.postgres.enabled }}
{{- printf "%s-postgres" .Release.Name }}
{{- else }}
{{- printf "%s-external-db" (include "myelectricaldata.fullname" .) }}
{{- end }}
{{- end }}
