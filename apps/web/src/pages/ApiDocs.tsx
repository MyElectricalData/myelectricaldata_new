import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'
import { BookOpen, Key } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { Link } from 'react-router-dom'

export default function ApiDocs() {
  // Get the access token from localStorage
  const accessToken = useMemo(() => localStorage.getItem('access_token'), [])
  const { isDark } = useThemeStore()
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081'

  useEffect(() => {
    // Hide the "Explore" link and customize Swagger UI colors
    const style = document.createElement('style')

    // Common styles for both themes
    const commonStyles = `
      .swagger-ui .info .link,
      .swagger-ui .scheme-container {
        display: none !important;
      }

      /* Hide the title and description from Swagger UI */
      .swagger-ui .info .title,
      .swagger-ui .info .description {
        display: none !important;
      }

      /* Remove the entire info section spacing */
      .swagger-ui .info {
        margin: 0 !important;
        padding: 0 !important;
        display: none !important;
      }

      /* Remove top padding from main wrapper */
      .swagger-ui .wrapper {
        padding-top: 0 !important;
      }
    `

    // Dark theme styles
    const darkStyles = `

      /* Dark theme colors for Swagger UI */
      .swagger-ui {
        color: #f3f4f6 !important;
      }

      .swagger-ui .info .title,
      .swagger-ui .info h1,
      .swagger-ui .info h2,
      .swagger-ui .info h3,
      .swagger-ui .info h4,
      .swagger-ui .info h5 {
        color: #ffffff !important;
      }

      .swagger-ui .info .description,
      .swagger-ui .info p,
      .swagger-ui .info li {
        color: #e5e7eb !important;
      }

      .swagger-ui .opblock-tag {
        color: #ffffff !important;
        border-bottom-color: #4b5563 !important;
      }

      .swagger-ui .opblock .opblock-summary-description {
        color: #e5e7eb !important;
      }

      .swagger-ui .opblock-description-wrapper p,
      .swagger-ui .opblock-external-docs-wrapper p,
      .swagger-ui .opblock-title_normal p {
        color: #e5e7eb !important;
      }

      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type {
        color: #ffffff !important;
      }

      /* Make all parameter labels white */
      .swagger-ui .parameters .parameter__name {
        color: #ffffff !important;
      }

      .swagger-ui .parameters label {
        color: #ffffff !important;
      }

      .swagger-ui .response-col_status {
        color: #ffffff !important;
      }

      .swagger-ui .response-col_description {
        color: #e5e7eb !important;
      }

      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td {
        color: #ffffff !important;
      }

      .swagger-ui .model-title,
      .swagger-ui .model {
        color: #f3f4f6 !important;
      }

      .swagger-ui .prop-type {
        color: #10b981 !important;
      }

      .swagger-ui .prop-format {
        color: #d1d5db !important;
      }

      .swagger-ui .renderedMarkdown p,
      .swagger-ui .renderedMarkdown code {
        color: #e5e7eb !important;
      }

      /* Code blocks with syntax highlighting */
      .swagger-ui .highlight-code,
      .swagger-ui .microlight,
      .swagger-ui pre,
      .swagger-ui pre.microlight {
        background-color: #1e293b !important;
        border: 1px solid #334155 !important;
        border-radius: 6px !important;
      }

      /* JSON syntax highlighting in code blocks */
      .swagger-ui .highlight-code .hljs-string,
      .swagger-ui .microlight .hljs-string,
      .swagger-ui pre .hljs-string {
        color: #86efac !important; /* Light green for strings */
      }

      .swagger-ui .highlight-code .hljs-number,
      .swagger-ui .microlight .hljs-number,
      .swagger-ui pre .hljs-number {
        color: #fbbf24 !important; /* Yellow for numbers */
      }

      .swagger-ui .highlight-code .hljs-literal,
      .swagger-ui .microlight .hljs-literal,
      .swagger-ui pre .hljs-literal {
        color: #60a5fa !important; /* Blue for booleans */
      }

      .swagger-ui .highlight-code .hljs-attr,
      .swagger-ui .microlight .hljs-attr,
      .swagger-ui pre .hljs-attr,
      .swagger-ui .highlight-code .property,
      .swagger-ui .microlight .property {
        color: #c084fc !important; /* Purple for property names */
      }

      /* Response example code blocks */
      .swagger-ui .example .highlight-code,
      .swagger-ui .responses-inner .highlight-code,
      .swagger-ui .example pre,
      .swagger-ui .responses-inner pre {
        background-color: #1e293b !important;
        color: #f1f5f9 !important;
      }

      /* Make sure all code text is visible */
      .swagger-ui .highlight-code *,
      .swagger-ui pre.microlight * {
        background: transparent !important;
      }

      .swagger-ui .parameters-col_description {
        color: #e5e7eb !important;
      }

      .swagger-ui select,
      .swagger-ui input[type=text],
      .swagger-ui input[type=email],
      .swagger-ui input[type=password],
      .swagger-ui textarea {
        color: #f3f4f6 !important;
        background-color: #1f2937 !important;
        border-color: #4b5563 !important;
      }

      /* Fix for the path text (e.g., /api/health) */
      .swagger-ui .opblock .opblock-summary-path {
        color: #f3f4f6 !important;
      }

      .swagger-ui .opblock .opblock-summary-path__deprecated {
        color: #f3f4f6 !important;
      }

      /* Fix for schema model names (e.g., HealthCheckResponse) */
      .swagger-ui .model-box {
        background-color: #1f2937 !important;
      }

      .swagger-ui .model-box-control {
        color: #f3f4f6 !important;
      }

      .swagger-ui .model-toggle {
        color: #f3f4f6 !important;
      }

      .swagger-ui .model-toggle::after {
        background-color: #f3f4f6 !important;
      }

      .swagger-ui .model-title {
        color: #f3f4f6 !important;
      }

      /* Fix for response model collapse text */
      .swagger-ui .model-box .model-collapse-btn {
        color: #f3f4f6 !important;
      }

      /* Fix for the green "Example Value | Model" text */
      .swagger-ui .tab li button {
        color: #f3f4f6 !important;
      }

      .swagger-ui .tab li button.active {
        color: #ffffff !important;
      }

      /* Replace gray backgrounds with blue theme */
      .swagger-ui .opblock .opblock-section-header {
        background: rgba(59, 130, 246, 0.35) !important;
        border-bottom: 1px solid rgba(59, 130, 246, 0.5) !important;
      }

      .swagger-ui .opblock .opblock-section-header h4 {
        color: #ffffff !important;
      }

      .swagger-ui .opblock .opblock-section-header label {
        color: #ffffff !important;
      }

      /* Request body and responses headers */
      .swagger-ui .opblock-section-request-body,
      .swagger-ui .opblock-section-responses {
        background: transparent !important;
      }

      .swagger-ui .opblock-section-header {
        background: rgba(59, 130, 246, 0.4) !important;
      }

      /* Table headers */
      .swagger-ui table thead tr {
        background: rgba(59, 130, 246, 0.35) !important;
        border-bottom: 1px solid rgba(59, 130, 246, 0.5) !important;
      }

      .swagger-ui table thead tr th {
        color: #ffffff !important;
      }

      /* Rounded corners for parameter table headers */
      .swagger-ui .parameters > table > thead > tr > th:first-child {
        border-top-left-radius: 8px !important;
      }

      .swagger-ui .parameters > table > thead > tr > th:last-child {
        border-top-right-radius: 8px !important;
      }

      /* Rounded corners for response table headers */
      .swagger-ui .responses-table > thead > tr > th:first-child {
        border-top-left-radius: 8px !important;
      }

      .swagger-ui .responses-table > thead > tr > th:last-child {
        border-top-right-radius: 8px !important;
      }

      /* General table header rounding */
      .swagger-ui table thead tr:first-child th:first-child {
        border-top-left-radius: 8px !important;
      }

      .swagger-ui table thead tr:first-child th:last-child {
        border-top-right-radius: 8px !important;
      }

      /* Rounded corners for responses header row */
      .swagger-ui tr.responses-header {
        border-radius: 8px !important;
      }

      .swagger-ui tr.responses-header td:first-child,
      .swagger-ui tr.responses-header th:first-child {
        border-top-left-radius: 8px !important;
        border-bottom-left-radius: 8px !important;
      }

      .swagger-ui tr.responses-header td:last-child,
      .swagger-ui tr.responses-header th:last-child {
        border-top-right-radius: 8px !important;
        border-bottom-right-radius: 8px !important;
      }

      /* Add padding to Code column header */
      .swagger-ui .responses-header .col_header:first-child,
      .swagger-ui tr.responses-header td:first-child,
      .swagger-ui tr.responses-header th:first-child {
        padding-left: 16px !important;
      }

      /* Add padding to Description column header */
      .swagger-ui .responses-header .col_header:nth-child(2),
      .swagger-ui tr.responses-header td:nth-child(2),
      .swagger-ui tr.responses-header th:nth-child(2) {
        padding-left: 40px !important;
      }

      /* Adjust columns in responses table */
      .swagger-ui .responses-table thead tr th:first-child {
        padding-left: 16px !important;
        text-align: left !important;
      }

      .swagger-ui .responses-table thead tr th:nth-child(2) {
        padding-left: 40px !important;
        text-align: left !important;
      }

      /* Add padding to Parameters table columns */
      .swagger-ui .col_header.parameters-col_name,
      .swagger-ui .parameters thead tr th:first-child {
        padding-left: 16px !important;
        text-align: left !important;
      }

      .swagger-ui .col_header.parameters-col_description,
      .swagger-ui .parameters thead tr th:nth-child(2) {
        padding-left: 40px !important;
        text-align: left !important;
      }

      /* Rounded corners for response details tabs */
      .swagger-ui .tab-header {
        border-radius: 8px 8px 0 0 !important;
        overflow: hidden !important;
      }

      .swagger-ui .responses-inner .tab-header {
        border-radius: 8px 8px 0 0 !important;
      }

      /* Response tab styling with rounded corners */
      .swagger-ui .responses-inner > div > .tab {
        border-radius: 8px 8px 0 0 !important;
        overflow: hidden !important;
      }

      /* Make numbered badges more visible */
      .swagger-ui .response-col_status .response-code {
        background-color: #ef4444 !important;
        color: #ffffff !important;
        padding: 4px 10px !important;
        border-radius: 12px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
      }

      /* Red background for badges in tabs */
      .swagger-ui .tab-item .tabitem-badge,
      .swagger-ui .tab .tabitem span:last-child,
      .swagger-ui .responses-inner .tab span {
        background-color: #ef4444 !important;
        color: #ffffff !important;
        padding: 2px 8px !important;
        border-radius: 12px !important;
        font-weight: 600 !important;
        margin-left: 8px !important;
      }

      /* Response tabs */
      .swagger-ui .responses-inner h4,
      .swagger-ui .responses-inner h5 {
        color: #f3f4f6 !important;
      }

      /* Schemas section - softer gray text instead of white */
      .swagger-ui section.models {
        border-color: #374151 !important;
      }

      /* Force ALL h4 elements in models section to soft gray */
      .swagger-ui section.models h4,
      .swagger-ui section.models h4.model-title,
      .swagger-ui section.models .model-title,
      .swagger-ui h4.model-title,
      h4.model-title {
        color: #d1d5db !important;
      }

      /* Target absolutely everything in the models section - soft gray */
      .swagger-ui section.models h4 *,
      .swagger-ui section.models .model-title *,
      .swagger-ui section.models span,
      .swagger-ui section.models .model-container *,
      .swagger-ui section.models .model-box * {
        color: #d1d5db !important;
      }

      /* Ultra specific for model titles */
      .swagger-ui .models-control,
      .swagger-ui .model-container h4,
      .swagger-ui .model-container .model-title {
        color: #d1d5db !important;
      }

      /* Everything inside section.models - default gray */
      section.models * {
        color: #d1d5db !important;
      }

      section.models h4 {
        color: #d1d5db !important;
      }

      /* Type values (boolean, string, any, null, object) in light blue - MUST come after universal selector */
      .swagger-ui section.models .model .renderedMarkdown span,
      .swagger-ui section.models td:nth-child(2),
      .swagger-ui section.models .model-toggle span,
      .swagger-ui section.models .json-schema-2020-12__attribute,
      .swagger-ui section.models span[class*="json-schema"],
      section.models .renderedMarkdown span,
      section.models td:nth-child(2),
      section.models .json-schema-2020-12__attribute,
      section.models span[class*="json-schema"] {
        color: #60a5fa !important;
      }

      /* Expand all / Collapse all buttons - bright green for visibility */
      .swagger-ui section.models .model-container .model-box-control,
      .swagger-ui section.models h5 span,
      .swagger-ui section.models h5 a,
      .swagger-ui section.models button,
      section.models h5 a,
      section.models .models-control span,
      section.models .models-control a,
      section.models button {
        color: #10b981 !important;
        font-weight: 600 !important;
      }

      .swagger-ui section.models h5 a:hover,
      section.models h5 a:hover {
        color: #34d399 !important;
      }

      /* Better differentiation in schemas - similar to light mode */
      /* Schema property names in white */
      .swagger-ui section.models .property,
      .swagger-ui section.models .prop-name,
      section.models .property,
      section.models .prop-name {
        color: #ffffff !important;
      }

      /* Property types and "object" keyword in light blue */
      .swagger-ui section.models .prop-type,
      .swagger-ui section.models .model-title,
      section.models .prop-type,
      section.models .model-title {
        color: #60a5fa !important;
        font-weight: 600 !important;
      }

      /* Primitive types like boolean, string, any, null in light blue */
      .swagger-ui section.models span,
      .swagger-ui section.models .model span,
      section.models span {
        color: inherit !important;
      }

      .swagger-ui section.models .model span,
      section.models .model span {
        color: #60a5fa !important;
      }

      /* Property format/additional info in lighter gray */
      .swagger-ui section.models .prop-format,
      section.models .prop-format {
        color: #9ca3af !important;
      }

      /* Required badge in red */
      .swagger-ui section.models .star,
      .swagger-ui section.models .required,
      section.models .star,
      section.models .required {
        color: #ef4444 !important;
      }

      /* Braces and brackets in cyan */
      .swagger-ui section.models .brace-open,
      .swagger-ui section.models .brace-close,
      .swagger-ui section.models .bracket,
      section.models .brace-open,
      section.models .brace-close,
      section.models .bracket {
        color: #06b6d4 !important;
      }

      /* Enum values and examples in yellow/amber */
      .swagger-ui section.models .prop-enum,
      section.models .prop-enum {
        color: #fbbf24 !important;
      }

      /* Format badges like "date-time" - make text darker and more readable */
      .swagger-ui section.models .model-box .prop-format,
      .swagger-ui section.models span[style*="background"],
      section.models .model-box .prop-format {
        color: #1f2937 !important;
        background-color: #fbbf24 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-weight: 600 !important;
      }

      /* String constraint badges like "email" - white background instead of orange */
      .swagger-ui .json-schema-2020-12__constraint--string,
      .swagger-ui section.models .json-schema-2020-12__constraint--string,
      section.models .json-schema-2020-12__constraint--string {
        background-color: #ffffff !important;
        color: #1f2937 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-weight: 600 !important;
        border: 1px solid #d1d5db !important;
      }

      /* SVG paths inside models section - must come BEFORE button rules */
      section.models svg,
      section.models svg *,
      .swagger-ui section.models svg,
      .swagger-ui section.models svg * {
        color: #9ca3af !important;
        fill: #9ca3af !important;
        stroke: #9ca3af !important;
      }

      section.models svg path,
      .swagger-ui section.models svg path,
      section.models svg polygon,
      .swagger-ui section.models svg polygon,
      section.models svg circle,
      .swagger-ui section.models svg circle,
      section.models svg rect,
      .swagger-ui section.models svg rect,
      section.models svg line,
      .swagger-ui section.models svg line {
        fill: #9ca3af !important;
        stroke: #9ca3af !important;
        color: #9ca3af !important;
      }

      section.models svg:hover,
      section.models svg:hover *,
      .swagger-ui section.models svg:hover,
      .swagger-ui section.models svg:hover * {
        color: #60a5fa !important;
        fill: #60a5fa !important;
        stroke: #60a5fa !important;
      }

      section.models svg:hover path,
      .swagger-ui section.models svg:hover path,
      section.models svg:hover polygon,
      .swagger-ui section.models svg:hover polygon,
      section.models svg:hover circle,
      .swagger-ui section.models svg:hover circle {
        fill: #60a5fa !important;
        stroke: #60a5fa !important;
      }

      /* Chevrons and toggle arrows */
      .swagger-ui section.models .model-toggle,
      .swagger-ui section.models .model-toggle::after,
      .swagger-ui section.models .arrow,
      .swagger-ui section.models button.model-toggle,
      section.models .model-toggle,
      section.models button.model-toggle {
        color: #9ca3af !important;
        border-color: #9ca3af !important;
      }

      .swagger-ui section.models .model-toggle:hover,
      section.models .model-toggle:hover {
        color: #60a5fa !important;
      }

      /* Expand/Collapse links in blue - keep text blue for links but not SVGs */
      .swagger-ui section.models .model-toggle-btn,
      .swagger-ui section.models a,
      section.models a {
        color: #60a5fa !important;
      }

      /* All schema property names in white */
      .swagger-ui .model .property-row .property-name,
      .swagger-ui .model .property-row td:first-child,
      .swagger-ui .model .brace-open,
      .swagger-ui .model .brace-close {
        color: #ffffff !important;
      }

      /* Schema descriptions and additional text */
      .swagger-ui .model-box .model-title,
      .swagger-ui .model-box .model-title span {
        color: #ffffff !important;
      }

      /* Schema property names and types */
      .swagger-ui .property-row .renderedMarkdown p {
        color: #e5e7eb !important;
      }

      /* Force all property names to be white */
      .swagger-ui .model-box .property,
      .swagger-ui .model-box .model .property,
      .swagger-ui section.models .property {
        color: #ffffff !important;
      }

      /* Target specifically the gray property names like success, data, error, etc. */
      .swagger-ui .model .model-container .property,
      .swagger-ui .models-container .property {
        color: #ffffff !important;
      }

      /* All text inside model boxes */
      .swagger-ui .model-container,
      .swagger-ui .model-container * {
        color: inherit !important;
      }

      .swagger-ui .model-container .property,
      .swagger-ui .model-container .property span,
      .swagger-ui .model-container strong {
        color: #ffffff !important;
      }

      /* Schema title headers (APIResponse, AdminPDLCreate, etc.) */
      .swagger-ui .model h4,
      .swagger-ui .model h4 span,
      .swagger-ui section.models .model-container > h4,
      .swagger-ui section.models h4 {
        color: #ffffff !important;
      }

      /* Fix all gray text in schemas section */
      .swagger-ui .model .property-row td:first-child {
        color: #ffffff !important;
      }

      .swagger-ui .model .prop-name {
        color: #ffffff !important;
      }

      .swagger-ui .model .prop-desc {
        color: #e5e7eb !important;
      }

      /* Fix parameter table text */
      .swagger-ui .parameters .parameter__name {
        color: #ffffff !important;
      }

      .swagger-ui .parameters .parameter__type {
        color: #e5e7eb !important;
      }

      .swagger-ui .parameters .parameter__in {
        color: #9ca3af !important;
        font-style: italic;
      }

      /* Fix response section text */
      .swagger-ui .responses-wrapper .response-col_status {
        color: #ffffff !important;
      }

      .swagger-ui .responses-wrapper .response-col_description {
        color: #ffffff !important;
      }

      .swagger-ui .responses-wrapper .response-col_links {
        color: #ffffff !important;
      }

      /* Fix "Links" text in responses */
      .swagger-ui .responses-table .response-col_links {
        color: #ffffff !important;
      }

      /* Fix all body text content */
      .swagger-ui .body-param__text {
        color: #e5e7eb !important;
      }

      /* Fix italic path/query labels */
      .swagger-ui .parameters-col_description p {
        color: #e5e7eb !important;
      }

      /* Ensure all text in collapsed/expanded states is visible */
      .swagger-ui .model-deprecated-warning {
        color: #fbbf24 !important;
      }

      /* Make lock and chevron icons white and larger */
      .swagger-ui svg.locked,
      .swagger-ui svg.locked path,
      .swagger-ui svg.arrow,
      .swagger-ui svg.arrow path,
      .swagger-ui .authorization__btn svg,
      .swagger-ui .authorization__btn svg path,
      .swagger-ui .opblock-control-arrow,
      .swagger-ui .opblock-control-arrow svg,
      .swagger-ui .opblock-control-arrow svg path {
        fill: #ffffff !important;
        stroke: #ffffff !important;
        width: 24px !important;
        height: 24px !important;
      }

      /* Make expand/collapse chevrons white */
      .swagger-ui .opblock .opblock-summary-control .arrow,
      .swagger-ui .opblock .opblock-summary-control svg,
      .swagger-ui .opblock .opblock-summary-control svg path {
        fill: #ffffff !important;
        stroke: #ffffff !important;
      }

      /* Fix "Try it out" button - multiple selectors for better coverage */
      .swagger-ui .btn.try-out__btn,
      .swagger-ui button.btn.try-out__btn,
      .swagger-ui .opblock-section-header .try-out__btn {
        color: #ffffff !important;
        background-color: #3b82f6 !important;
        border-color: #3b82f6 !important;
        box-shadow: none !important;
      }

      .swagger-ui .btn.try-out__btn:hover,
      .swagger-ui button.btn.try-out__btn:hover {
        background-color: #2563eb !important;
        border-color: #2563eb !important;
      }

      /* Ensure button text is white */
      .swagger-ui .try-out__btn span,
      .swagger-ui .try-out__btn {
        color: #ffffff !important;
        text-shadow: none !important;
      }

      .swagger-ui .btn.cancel {
        color: #ffffff !important;
        background-color: #ef4444 !important;
        border-color: #ef4444 !important;
      }

      .swagger-ui .btn.cancel:hover {
        background-color: #dc2626 !important;
        border-color: #dc2626 !important;
      }

      .swagger-ui .btn.execute {
        color: #ffffff !important;
        background-color: #3b82f6 !important;
        border-color: #3b82f6 !important;
      }

      .swagger-ui .btn.execute:hover {
        background-color: #2563eb !important;
        border-color: #2563eb !important;
      }
    `

    // Light theme styles - minimal adjustments for light mode
    const lightStyles = `
      /* Light theme - keep default Swagger colors mostly */
      .swagger-ui {
        color: #3b4151 !important;
      }

      /* Buttons for light theme */
      .swagger-ui .btn.try-out__btn,
      .swagger-ui button.btn.try-out__btn {
        color: #ffffff !important;
        background-color: #3b82f6 !important;
        border-color: #3b82f6 !important;
      }

      .swagger-ui .btn.execute {
        color: #ffffff !important;
        background-color: #3b82f6 !important;
        border-color: #3b82f6 !important;
      }
    `

    // Apply the appropriate theme styles
    style.textContent = commonStyles + (isDark ? darkStyles : lightStyles)
    document.head.appendChild(style)

    return () => {
      document.head.removeChild(style)
    }
  }, [isDark])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <BookOpen className="text-primary-600 dark:text-primary-400" size={32} />
          Documentation API
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Documentation interactive de l'API MyElectricalData
        </p>
      </div>

      {/* OAuth 2.0 Authentication Block - Compact version at the top */}
      <div className="mb-3">
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={18} />
              <div className="text-sm">
                <span className="font-semibold text-blue-900 dark:text-blue-100">
                  🔐 Authentification OAuth 2.0 pour vos applications
                </span>
                <span className="text-blue-800 dark:text-blue-200 ml-2">
                  - Utilisez le protocole OAuth 2.0 avec Client Credentials
                </span>
              </div>
            </div>
            <Link
              to="/api-docs/auth"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            >
              <Key size={14} />
              Guide complet
            </Link>
          </div>
        </div>
      </div>

      {/* Authentication Notice - Green block */}
      <div className="mb-4">
        <div className="p-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-lg">
          <div className="flex items-start gap-2">
            <Key className="text-green-600 dark:text-green-400 flex-shrink-0" size={18} />
            <div className="text-sm">
              <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                ✅ Vous êtes déjà authentifié
              </h3>
              <p className="text-green-800 dark:text-green-200">
                Vous êtes actuellement connecté. Vous pouvez directement tester les endpoints en cliquant sur "Try it out".
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <SwaggerUI
            url={`${apiBaseUrl}/openapi.json`}
            docExpansion="list"
            defaultModelsExpandDepth={1}
            displayRequestDuration={true}
            deepLinking={false}
            requestInterceptor={(req) => {
              // Add Authorization header with the access token
              if (accessToken) {
                req.headers.Authorization = `Bearer ${accessToken}`
              }
              return req
            }}
            onComplete={(swaggerApi) => {
              // Pre-authorize with the Bearer token
              if (accessToken) {
                swaggerApi.preauthorizeApiKey('HTTPBearer', accessToken)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
