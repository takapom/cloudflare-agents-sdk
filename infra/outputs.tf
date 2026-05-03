output "worker_name" {
  description = "Cloudflare Worker script name."
  value       = var.worker_name
}

output "vectorize_index_name" {
  description = "Vectorize index name."
  value       = var.vectorize_index_name
}

output "workers_dev_enabled" {
  description = "Whether the workers.dev subdomain is enabled for the Worker."
  value       = cloudflare_workers_script_subdomain.workers_dev.enabled
}
