//! Offline ZeroClaw verifier for `zc-proof-bundle-v1`.
//!
//! The pure verifier is host-testable and the WASM component reuses the same
//! handler. No network, filesystem, configuration, wallet, or signing
//! permission is required.

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use spki::DecodePublicKey;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Attestation {
    algorithm: String,
    public_key: String,
    signature: String,
    signed_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Offer {
    version: String,
    payment_id: String,
    invoice_id: String,
    order_id: String,
    recipient: String,
    amount: String,
    asset: String,
    mint: Value,
    reference: String,
    memo: String,
    cluster: String,
    created_at: String,
    expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Settlement {
    version: String,
    payment_id: String,
    offer_hash: String,
    signature: String,
    outcome: String,
    anomalies: Vec<String>,
    expected_amount: f64,
    #[serde(default)]
    observed_amount: Option<f64>,
    signature_count: u64,
    witness_quorum: WitnessQuorum,
    witnesses: Vec<Witness>,
    verified_at: String,
    proof_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct WitnessQuorum {
    required: u64,
    valid: u64,
    agreed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Witness {
    name: String,
    rpc_url: String,
    genesis_hash: String,
    signature: String,
    slot: String,
    block_time: Option<String>,
    transaction_digest: String,
    transaction_succeeded: bool,
    reference_present: bool,
    recipient_present: bool,
    mint_matches: bool,
    memo_matches: bool,
    #[serde(default)]
    observed_amount: Option<f64>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProofBundle {
    version: String,
    offer: Offer,
    offer_hash: String,
    offer_attestation: Attestation,
    #[serde(default)]
    settlement: Option<Settlement>,
    #[serde(default)]
    settlement_attestation: Option<Attestation>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub valid: bool,
    pub schema_valid: bool,
    pub offer_hash_valid: bool,
    pub settlement_hash_valid: Option<bool>,
    pub offer_attestation_valid: bool,
    pub settlement_attestation_valid: Option<bool>,
    pub linkage_valid: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ExecuteArgs {
    bundle_json: Value,
}

pub fn verify_value(value: &Value) -> Verification {
    let bundle: ProofBundle = match serde_json::from_value(value.clone()) {
        Ok(bundle) if schema_valid(&bundle) => bundle,
        _ => return Verification::invalid(),
    };

    let offer_value = match value.get("offer") {
        Some(value) => value,
        None => return Verification::invalid(),
    };
    let offer_hash_valid = sha256_canonical(offer_value) == bundle.offer_hash;
    let offer_attestation_valid = bundle.offer_attestation.signed_hash == bundle.offer_hash
        && verify_attestation(&bundle.offer_attestation);

    let (settlement_hash_valid, settlement_attestation_valid, linkage_valid) =
        match &bundle.settlement {
            Some(settlement) => {
                let mut settlement_value = match value.get("settlement") {
                    Some(Value::Object(value)) => value.clone(),
                    _ => return Verification::invalid(),
                };
                settlement_value.remove("proofHash");
                let hash_valid =
                    sha256_canonical(&Value::Object(settlement_value)) == settlement.proof_hash;
                let attestation_valid = bundle
                    .settlement_attestation
                    .as_ref()
                    .map(|attestation| {
                        attestation.signed_hash == settlement.proof_hash
                            && verify_attestation(attestation)
                    })
                    .unwrap_or(false);
                let linked = settlement.payment_id == bundle.offer.payment_id
                    && settlement.offer_hash == bundle.offer_hash;
                (Some(hash_valid), Some(attestation_valid), Some(linked))
            }
            None => (None, None, None),
        };

    Verification {
        valid: offer_hash_valid
            && offer_attestation_valid
            && settlement_hash_valid != Some(false)
            && settlement_attestation_valid != Some(false)
            && linkage_valid != Some(false),
        schema_valid: true,
        offer_hash_valid,
        settlement_hash_valid,
        offer_attestation_valid,
        settlement_attestation_valid,
        linkage_valid,
    }
}

impl Verification {
    fn invalid() -> Self {
        Self {
            valid: false,
            schema_valid: false,
            offer_hash_valid: false,
            settlement_hash_valid: None,
            offer_attestation_valid: false,
            settlement_attestation_valid: None,
            linkage_valid: None,
        }
    }
}

fn schema_valid(bundle: &ProofBundle) -> bool {
    if bundle.version != "zc-proof-bundle-v1"
        || bundle.offer.version != "zc-offer-v1"
        || !is_hash(&bundle.offer_hash)
        || !is_attestation_shape(&bundle.offer_attestation)
        || bundle.offer.payment_id.is_empty()
        || bundle.offer.invoice_id.is_empty()
        || bundle.offer.order_id.is_empty()
        || bundle.offer.recipient.is_empty()
        || bundle.offer.amount.is_empty()
        || bundle.offer.asset.is_empty()
        || !(bundle.offer.mint.is_null() || bundle.offer.mint.is_string())
        || bundle.offer.reference.is_empty()
        || bundle.offer.memo.is_empty()
        || bundle.offer.created_at.is_empty()
        || bundle.offer.expires_at.is_empty()
        || !matches!(
            bundle.offer.cluster.as_str(),
            "localnet" | "devnet" | "mainnet-beta"
        )
    {
        return false;
    }
    match (&bundle.settlement, &bundle.settlement_attestation) {
        (None, None) => true,
        (Some(settlement), Some(attestation)) => {
            let base_valid = settlement.version == "zc-settlement-v1"
                && is_hash(&settlement.offer_hash)
                && is_hash(&settlement.proof_hash)
                && !settlement.payment_id.is_empty()
                && !settlement.signature.is_empty()
                && !settlement.verified_at.is_empty()
                && matches!(
                    settlement.outcome.as_str(),
                    "accepted" | "attention" | "rejected" | "simulated"
                )
                && settlement.expected_amount.is_finite()
                && settlement.expected_amount > 0.0
                && settlement
                    .observed_amount
                    .map(|amount| amount.is_finite() && amount >= 0.0)
                    .unwrap_or(true)
                && settlement.anomalies.iter().all(|anomaly| {
                    matches!(
                        anomaly.as_str(),
                        "duplicate_reference"
                            | "invalid_payment"
                            | "late_payment"
                            | "overpayment"
                            | "underpayment"
                            | "witness_disagreement"
                    )
                })
                && settlement.witness_quorum.valid <= settlement.witnesses.len() as u64
                && settlement.witness_quorum.required <= settlement.witnesses.len() as u64
                && settlement.witnesses.iter().all(witness_shape_valid)
                && is_attestation_shape(attestation);
            let outcome_valid = match settlement.outcome.as_str() {
                "accepted" => {
                    settlement.anomalies.is_empty()
                        && settlement.witness_quorum.agreed
                        && settlement.witness_quorum.valid >= settlement.witness_quorum.required
                }
                "simulated" => {
                    settlement.anomalies.is_empty()
                        && settlement.witnesses.is_empty()
                        && settlement.witness_quorum.required == 0
                        && settlement.witness_quorum.valid == 0
                        && settlement.witness_quorum.agreed
                }
                "attention" | "rejected" => !settlement.anomalies.is_empty(),
                _ => false,
            };
            base_valid && outcome_valid
        }
        _ => false,
    }
}

fn witness_shape_valid(witness: &Witness) -> bool {
    !witness.name.is_empty()
        && !witness.rpc_url.is_empty()
        && !witness.signature.is_empty()
        && witness.observed_amount.map(f64::is_finite).unwrap_or(true)
}

fn is_attestation_shape(attestation: &Attestation) -> bool {
    attestation.algorithm == "Ed25519"
        && is_hash(&attestation.signed_hash)
        && !attestation.public_key.is_empty()
        && !attestation.signature.is_empty()
}

fn verify_attestation(attestation: &Attestation) -> bool {
    if !is_attestation_shape(attestation) {
        return false;
    }
    let public_der = match base64::engine::general_purpose::STANDARD.decode(&attestation.public_key)
    {
        Ok(value) => value,
        Err(_) => return false,
    };
    let key = match VerifyingKey::from_public_key_der(&public_der) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let signature_bytes =
        match base64::engine::general_purpose::STANDARD.decode(&attestation.signature) {
            Ok(value) => value,
            Err(_) => return false,
        };
    let signature = match Signature::from_slice(&signature_bytes) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let message = match hex::decode(&attestation.signed_hash) {
        Ok(value) if value.len() == 32 => value,
        _ => return false,
    };
    key.verify(&message, &signature).is_ok()
}

fn sha256_canonical(value: &Value) -> String {
    let canonical = canonical_json(value);
    hex::encode(Sha256::digest(canonical.as_bytes()))
}

fn canonical_json(value: &Value) -> String {
    serde_json::to_string(&sort_value(value)).expect("canonical JSON is serializable")
}

fn sort_value(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(sort_value).collect()),
        Value::Object(items) => {
            let mut keys: Vec<_> = items.keys().collect();
            keys.sort_by(|left, right| compare_canonical_keys(left, right));
            let mut sorted = Map::new();
            for key in keys {
                sorted.insert(key.clone(), sort_value(&items[key]));
            }
            Value::Object(sorted)
        }
        _ => value.clone(),
    }
}

fn compare_canonical_keys(left: &str, right: &str) -> std::cmp::Ordering {
    let folded_left = left.to_ascii_lowercase();
    let folded_right = right.to_ascii_lowercase();
    folded_left.cmp(&folded_right).then_with(|| left.cmp(right))
}

fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub mod handler {
    use super::*;
    use serde_json::json;

    pub const SCHEMA: &str = r#"{
      "type": "object",
      "properties": {
        "bundle_json": {
          "type": "object",
          "description": "A zc-proof-bundle-v1 JSON object to verify offline."
        }
      },
      "required": ["bundle_json"],
      "additionalProperties": false
    }"#;

    pub fn run(args: &str) -> (String, bool) {
        let parsed: ExecuteArgs = match serde_json::from_str(args) {
            Ok(value) => value,
            Err(error) => {
                return (
                    json!({ "ok": false, "error": format!("invalid arguments: {error}") })
                        .to_string(),
                    false,
                )
            }
        };
        let verification = verify_value(&parsed.bundle_json);
        (
            json!({
                "ok": true,
                "verification": verification,
                "verdict": if verification.valid { "valid" } else { "invalid" }
            })
            .to_string(),
            true,
        )
    }
}

#[cfg(target_family = "wasm")]
mod component {
    wit_bindgen::generate!({
        path: "wit/v0",
        world: "tool-plugin",
        features: ["plugins-wit-v0"],
    });

    use crate::handler;
    use exports::zeroclaw::plugin::plugin_info::Guest as PluginInfo;
    use exports::zeroclaw::plugin::tool::{Guest as Tool, ToolResult};
    use zeroclaw::plugin::logging::{
        log_record, LogLevel, PluginAction, PluginEvent, PluginOutcome,
    };

    struct ProofBundleVerify;

    impl PluginInfo for ProofBundleVerify {
        fn plugin_name() -> String {
            env!("CARGO_PKG_NAME").to_string()
        }

        fn plugin_version() -> String {
            env!("CARGO_PKG_VERSION").to_string()
        }
    }

    impl Tool for ProofBundleVerify {
        fn name() -> String {
            "verify_cashier_proof_bundle".to_string()
        }

        fn description() -> String {
            "Verify a Proof-Carrying Cashier bundle entirely offline. Checks \
             schema versions, canonical SHA-256 offer and settlement hashes, \
             Ed25519 issuer attestations, and offer-to-settlement linkage. \
             It has no network, filesystem, configuration, wallet, or signing permission."
                .to_string()
        }

        fn parameters_schema() -> String {
            handler::SCHEMA.to_string()
        }

        fn execute(args: String) -> Result<ToolResult, String> {
            let (output, success) = handler::run(&args);
            let valid = output.contains("\"verdict\":\"valid\"");
            log_record(
                if success && valid {
                    LogLevel::Info
                } else {
                    LogLevel::Warn
                },
                &PluginEvent {
                    function_name: "proof_bundle_verify::tool::execute".to_string(),
                    action: if success && valid {
                        PluginAction::Validate
                    } else {
                        PluginAction::Reject
                    },
                    outcome: Some(if success && valid {
                        PluginOutcome::Success
                    } else {
                        PluginOutcome::Failure
                    }),
                    duration_ms: None,
                    attrs: None,
                    message: if success && valid {
                        "proof bundle verified".to_string()
                    } else {
                        "proof bundle invalid".to_string()
                    },
                },
            );
            Ok(ToolResult {
                success,
                output,
                error: None,
            })
        }
    }

    export!(ProofBundleVerify);
}
