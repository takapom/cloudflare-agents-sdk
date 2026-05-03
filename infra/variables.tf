variable "cloudflare_account_id" {
  description = "Cloudflare account ID. Set with TF_VAR_cloudflare_account_id."
  type        = string
}

variable "worker_name" {
  description = "Cloudflare Worker script name."
  type        = string
  default     = "support-desk-pilot"
}

variable "vectorize_index_name" {
  description = "Vectorize index used by the SUPPORT_DESK_VECTORIZE binding."
  type        = string
  default     = "support-desk-tickets"
}

variable "vectorize_dimensions" {
  description = "Embedding dimensions for @cf/baai/bge-base-en-v1.5."
  type        = number
  default     = 768
}

variable "vectorize_metric" {
  description = "Vector distance metric."
  type        = string
  default     = "cosine"

  validation {
    condition     = contains(["cosine", "euclidean", "dot-product"], var.vectorize_metric)
    error_message = "vectorize_metric must be one of: cosine, euclidean, dot-product."
  }
}
