import type { ResourceTypeInfo, ResourceSample } from "../types";
import type { DomainPlugin, PluginProposal, PluginSourcedPath } from "./types";

/**
 * cert-manager plugin.
 *
 * Understands the cert-manager resource hierarchy:
 *   Certificate → CertificateRequest → Order → Challenge
 *   Certificate → Secret (output)
 *   Certificate/CertificateRequest → Issuer/ClusterIssuer
 *
 * Reference: https://cert-manager.io/docs/reference/api-docs/
 *
 * Key fields:
 *   Certificate.spec.issuerRef.name     → Issuer or ClusterIssuer
 *   Certificate.spec.issuerRef.kind     → "Issuer" or "ClusterIssuer"
 *   Certificate.spec.secretName         → Secret (output)
 *   CertificateRequest.spec.issuerRef   → Issuer or ClusterIssuer
 *   Order.spec.issuerRef                → Issuer (ACME)
 *   Challenge.spec.issuerRef            → Issuer (ACME)
 */
export class CertManagerPlugin implements DomainPlugin {
  readonly name = "cert-manager";
  readonly label = "cert-manager";

  detect(resourceTypes: ResourceTypeInfo[]): boolean {
    const kinds = new Set(resourceTypes.map((r) => r.kind));
    return kinds.has("Certificate") && (kinds.has("Issuer") || kinds.has("ClusterIssuer"));
  }

  propose(samples: ResourceSample[]): PluginProposal {
    const kinds = new Set(samples.map((s) => s.type.kind));
    const hasCertReq = kinds.has("CertificateRequest");
    const hasOrder = kinds.has("Order");
    const hasChallenge = kinds.has("Challenge");
    const hasIssuer = kinds.has("Issuer");
    const hasClusterIssuer = kinds.has("ClusterIssuer");
    const hasSecret = kinds.has("Secret");

    const identifiers: PluginProposal["identifiers"] = {
      certificate_name: { label: "Certificate Name" },
      issuer_name: { label: "Issuer Name" },
      secret_name: { label: "Secret Name" },
    };

    if (hasCertReq) {
      identifiers.certificaterequest_name = { label: "CertificateRequest Name" };
    }
    if (hasOrder) {
      identifiers.order_name = { label: "Order Name" };
    }
    if (hasChallenge) {
      identifiers.challenge_name = { label: "Challenge Name" };
    }
    if (hasClusterIssuer) {
      identifiers.clusterissuer_name = { label: "ClusterIssuer Name" };
    }

    const S = "cert-manager";
    const entities: PluginProposal["entities"] = {};

    // Certificate
    const certRefs: PluginProposal["entities"][string]["references"] = [];

    // Certificate → Issuer (via spec.issuerRef)
    if (hasIssuer) {
      certRefs.push({
        field: "spec.issuerRef.name",
        points_to: "Issuer",
        as: "issuer_name",
        source: S,
      });
    }
    if (hasClusterIssuer) {
      certRefs.push({
        field: "spec.issuerRef.name",
        points_to: "ClusterIssuer",
        as: "clusterissuer_name",
        source: S,
      });
    }
    // Certificate → Secret (output)
    if (hasSecret) {
      certRefs.push({
        field: "spec.secretName",
        points_to: "Secret",
        as: "secret_name",
        source: S,
      });
    }

    entities.Certificate = {
      label: "Certificate",
      format: "kubernetes_resource",
      identifiers: {
        certificate_name: { path: "metadata.name", source: S },
        issuer_name: { path: "spec.issuerRef.name", source: S },
        secret_name: { path: "spec.secretName", source: S },
      },
      references: certRefs,
      display: {
        ready: { path: "status.conditions[-1].status", source: S },
        status: { path: "status.conditions[-1].reason", source: S },
        not_after: { path: "status.notAfter", source: S },
        not_before: { path: "status.notBefore", source: S },
        renewal_time: { path: "status.renewalTime", source: S },
        namespace: { path: "metadata.namespace", source: S },
      },
    };

    // Issuer
    if (hasIssuer) {
      entities.Issuer = {
        label: "Issuer",
        format: "kubernetes_resource",
        identifiers: { issuer_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          ready: { path: "status.conditions[-1].status", source: S },
          status: { path: "status.conditions[-1].reason", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // ClusterIssuer
    if (hasClusterIssuer) {
      entities.ClusterIssuer = {
        label: "Cluster Issuer",
        format: "kubernetes_resource",
        identifiers: { clusterissuer_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          ready: { path: "status.conditions[-1].status", source: S },
          status: { path: "status.conditions[-1].reason", source: S },
        },
      };
    }

    // CertificateRequest
    if (hasCertReq) {
      const crRefs: PluginProposal["entities"][string]["references"] = [];
      if (hasIssuer) {
        crRefs.push({
          field: "spec.issuerRef.name",
          points_to: "Issuer",
          as: "issuer_name",
          source: S,
        });
      }
      if (hasClusterIssuer) {
        crRefs.push({
          field: "spec.issuerRef.name",
          points_to: "ClusterIssuer",
          as: "clusterissuer_name",
          source: S,
        });
      }

      entities.CertificateRequest = {
        label: "Certificate Request",
        format: "kubernetes_resource",
        identifiers: {
          certificaterequest_name: { path: "metadata.name", source: S },
          certificate_name: { path: "metadata.annotations['cert-manager.io/certificate-name']", source: S },
        },
        references: [
          {
            field: "metadata.annotations['cert-manager.io/certificate-name']",
            points_to: "Certificate",
            as: "certificate_name",
            source: S,
          },
          ...crRefs,
        ],
        display: {
          ready: { path: "status.conditions[-1].status", source: S },
          status: { path: "status.conditions[-1].reason", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Order (ACME)
    if (hasOrder) {
      entities.Order = {
        label: "Order",
        format: "kubernetes_resource",
        identifiers: { order_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          state: { path: "status.state", source: S },
          url: { path: "status.url", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Challenge (ACME)
    if (hasChallenge) {
      entities.Challenge = {
        label: "Challenge",
        format: "kubernetes_resource",
        identifiers: { challenge_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          type: { path: "spec.type", source: S },
          domain: { path: "spec.dnsName", source: S },
          state: { path: "status.state", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Secret (if selected)
    if (hasSecret) {
      entities.Secret = {
        label: "Secret",
        format: "kubernetes_resource",
        identifiers: { secret_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          type: { path: "type", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    return {
      identifiers,
      seeds: [{ identifier: "certificate_name", primary: true }],
      entities,
    };
  }
}
