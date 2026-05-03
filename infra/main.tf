locals {
  project_root = abspath("${path.module}/..")

  source_hash = sha256(join("", concat(
    [
      for file in fileset(local.project_root, "src/**") :
      filesha256("${local.project_root}/${file}")
    ],
    [
      filesha256("${local.project_root}/index.html"),
      filesha256("${local.project_root}/package-lock.json"),
      filesha256("${local.project_root}/package.json"),
      filesha256("${local.project_root}/vite.config.ts"),
      filesha256("${local.project_root}/wrangler.jsonc")
    ]
  )))
}

resource "terraform_data" "vectorize_index" {
  triggers_replace = {
    name       = var.vectorize_index_name
    dimensions = var.vectorize_dimensions
    metric     = var.vectorize_metric
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-lc"]
    environment = {
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
    command = <<-EOT
      set -euo pipefail

      cd "${local.project_root}"

      if ! npx wrangler vectorize get "${var.vectorize_index_name}" >/dev/null 2>&1; then
        npx wrangler vectorize create "${var.vectorize_index_name}" \
          --dimensions="${var.vectorize_dimensions}" \
          --metric="${var.vectorize_metric}"
      fi

      metadata_indexes="$(npx wrangler vectorize list-metadata-index "${var.vectorize_index_name}" --json)"

      if ! printf '%s' "$metadata_indexes" | grep -q '"propertyName"[[:space:]]*:[[:space:]]*"status"'; then
        npx wrangler vectorize create-metadata-index "${var.vectorize_index_name}" \
          --propertyName="status" \
          --type="string"
      fi

      if ! printf '%s' "$metadata_indexes" | grep -q '"propertyName"[[:space:]]*:[[:space:]]*"priority"'; then
        npx wrangler vectorize create-metadata-index "${var.vectorize_index_name}" \
          --propertyName="priority" \
          --type="string"
      fi
    EOT
  }
}

resource "terraform_data" "worker_deploy" {
  triggers_replace = {
    source_hash = local.source_hash
  }

  depends_on = [terraform_data.vectorize_index]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-lc"]
    environment = {
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
    command = <<-EOT
      set -euo pipefail

      cd "${local.project_root}"
      npm run typecheck
      npm run deploy
    EOT
  }
}

resource "cloudflare_workers_script_subdomain" "workers_dev" {
  account_id       = var.cloudflare_account_id
  script_name      = var.worker_name
  enabled          = true
  previews_enabled = true

  depends_on = [terraform_data.worker_deploy]
}
