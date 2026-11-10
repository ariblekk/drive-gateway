export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>Omnibucket - Swagger API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    *, *:before, *:after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Topbar Navigation */
    .topbar-custom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px 20px;
      background: #18181b;
      color: #fff;
      border-bottom: 1px solid #27272a;
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      color: #fff;
      white-space: nowrap;
    }
    .topbar-brand svg {
      width: 22px;
      height: 22px;
      stroke: #fff;
    }
    .topbar-links {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .topbar-links a {
      color: #a1a1aa;
      font-size: 13px;
      text-decoration: none;
      transition: color 0.15s ease;
      white-space: nowrap;
    }
    .topbar-links a:hover {
      color: #fff;
    }

    /* Hide Swagger's default topbar */
    .swagger-ui .topbar {
      display: none;
    }

    /* General Layout adjustments */
    .swagger-ui .wrapper {
      padding: 0 16px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .swagger-ui .info {
      margin: 20px 0;
    }
    .swagger-ui .info .title {
      font-size: 24px;
      line-height: 1.3;
    }
    .swagger-ui .scheme-container {
      background: #f4f4f5;
      padding: 12px 0;
      box-shadow: none;
      border-bottom: 1px solid #e4e4e7;
    }

    /* Make Authorize button clean */
    .swagger-ui .btn.authorize {
      border-color: #18181b;
      color: #18181b;
      border-radius: 4px;
      font-weight: 500;
    }
    .swagger-ui .btn.authorize svg {
      fill: #18181b;
    }

    /* Tag header & subtitle layout */
    .swagger-ui .opblock-tag-section {
      margin-bottom: 12px;
    }
    .swagger-ui .opblock-tag {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 12px 0 8px 0 !important;
      border-bottom: 1px solid #e4e4e7 !important;
      gap: 4px 12px !important;
    }
    .swagger-ui .opblock-tag > span,
    .swagger-ui .opblock-tag > a {
      font-size: 18px !important;
      font-weight: 700 !important;
      color: #18181b !important;
    }
    .swagger-ui .opblock-tag button {
      margin-left: auto !important;
      order: 2 !important;
      padding: 4px !important;
    }
    .swagger-ui .opblock-tag small {
      display: block !important;
      width: 100% !important;
      flex-basis: 100% !important;
      order: 3 !important;
      margin: 4px 0 0 0 !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
      color: #71717a !important;
      white-space: normal !important;
      word-break: normal !important;
    }

    /* Responsive Operation Blocks */
    .swagger-ui .opblock .opblock-summary {
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
    }
    .swagger-ui .opblock .opblock-summary-method {
      min-width: 65px;
      text-align: center;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .swagger-ui .opblock .opblock-summary-path {
      max-width: 100%;
      word-break: break-all;
      font-size: 13px;
    }
    .swagger-ui .opblock .opblock-summary-description {
      width: 100%;
      margin: 0;
      font-size: 12px;
      color: #71717a;
    }

    /* Responsive Tables & Parameters */
    .swagger-ui table {
      display: block;
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .swagger-ui .parameters-col_name {
      width: 130px;
    }
    .swagger-ui .parameters-col_description {
      width: auto;
    }
    .swagger-ui select,
    .swagger-ui input[type=text],
    .swagger-ui textarea {
      max-width: 100% !important;
      border-radius: 4px;
    }

    /* Responsive Code and Schema boxes */
    .swagger-ui .highlight-code,
    .swagger-ui pre,
    .swagger-ui .model-box {
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* Responsive Modal Dialog (Authorize) */
    .swagger-ui .dialog-ux .backdrop-ux {
      background: rgba(0, 0, 0, 0.6);
    }
    .swagger-ui .dialog-ux .modal-ux {
      max-width: 92vw !important;
      width: 480px !important;
      border-radius: 8px;
      margin: 20px auto;
    }
    .swagger-ui .auth-container input[type=text],
    .swagger-ui .auth-container input[type=password] {
      width: 100% !important;
      max-width: 100% !important;
    }

    /* Mobile view optimizations (< 640px) */
    @media (max-width: 640px) {
      .topbar-custom {
        padding: 10px 14px;
        flex-direction: column;
        align-items: flex-start;
      }
      .topbar-links {
        width: 100%;
        justify-content: flex-start;
        gap: 12px;
        font-size: 12px;
        padding-top: 4px;
        border-top: 1px solid #27272a;
      }
      .swagger-ui .wrapper {
        padding: 0 8px;
      }
      .swagger-ui .info .title {
        font-size: 20px;
      }
      .swagger-ui .info p {
        font-size: 13px;
      }
      .swagger-ui .btn {
        width: 100%;
        margin-bottom: 6px;
      }
      .swagger-ui .opblock-body pre {
        font-size: 11px;
      }
    }
  </style>
</head>
<body>
  <div class="topbar-custom">
    <a href="/dashboard" class="topbar-brand">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6.657 16c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" />
        <path d="M12 16v5" />
        <path d="M16 16v4a1 1 0 0 0 1 1h4" />
        <path d="M8 16v4a1 1 0 0 1 -1 1h-4" />
      </svg>
      <span>Omnibucket API</span>
    </a>
    <div class="topbar-links">
      <a href="/dashboard">← Dashboard</a>
      <a href="/dashboard/settings">Credentials</a>
      <a href="/api/openapi.json" target="_blank">OpenAPI JSON</a>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1
      });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
