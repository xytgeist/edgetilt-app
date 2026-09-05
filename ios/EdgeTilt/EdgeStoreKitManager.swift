import Foundation
import StoreKit
import UIKit

/// StoreKit 2 in-app purchases for Edge platform + fan-tier subs. Grants via Edge `apple-iap-verify`.
@available(iOS 15.0, *)
final class EdgeStoreKitManager {
  static let shared = EdgeStoreKitManager()

  /// App Store product id → Edge product slug (annual/monthly encoded in id suffix).
  static let productIdToSlug: [String: String] = [
    "com.edgetilt.app.slots_edge_starter.monthly": "slots-edge-starter",
    "com.edgetilt.app.slots_edge_starter.annual": "slots-edge-starter",
    "com.edgetilt.app.slots_edge.monthly": "slots-edge",
    "com.edgetilt.app.slots_edge.annual": "slots-edge",
    "com.edgetilt.app.slots_edge_lifetime": "slots-edge-lifetime",
    "com.edgetilt.app.edge_pro.monthly": "edge-pro",
    "com.edgetilt.app.fan_tier_499.monthly": "fan-tier-499",
    "com.edgetilt.app.fan_tier_999.monthly": "fan-tier-999",
    "com.edgetilt.app.fan_tier_1999.monthly": "fan-tier-1999",
    "com.edgetilt.app.fan_tier_4999.monthly": "fan-tier-4999",
    "com.edgetilt.app.fan_tier_9999.monthly": "fan-tier-9999",
    "com.edgetilt.app.fan_tier_14999.monthly": "fan-tier-14999",
    "com.edgetilt.app.fan_tier_24999.monthly": "fan-tier-24999",
  ]

  private init() {}

  func fetchProducts(productIds: [String], completion: @escaping (Result<[String: Any], Error>) -> Void) {
    Task {
      do {
        let ids = Set(productIds.filter { !$0.isEmpty })
        let products = try await Product.products(for: ids)
        let rows: [[String: Any]] = products.map { product in
          [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "productSlug": Self.productIdToSlug[product.id] ?? "",
            "type": product.type == .nonConsumable ? "lifetime" : "subscription",
          ]
        }
        completion(.success(["products": rows]))
      } catch {
        completion(.failure(error))
      }
    }
  }

  func purchase(
    productId: String,
    appAccountToken: String?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    Task {
      do {
        let products = try await Product.products(for: [productId])
        guard let product = products.first else {
          completion(.failure(EdgeStoreKitError.productNotFound))
          return
        }

        var options: Set<Product.PurchaseOption> = []
        if let tokenRaw = appAccountToken?.trimmingCharacters(in: .whitespacesAndNewlines),
           let token = UUID(uuidString: tokenRaw) {
          options.insert(.appAccountToken(token))
        }

        let result = try await product.purchase(options: options)
        switch result {
        case .success(let verification):
          let transaction = try Self.checkVerified(verification)
          var payload = Self.transactionPayload(transaction)
          payload["signedTransactionInfo"] = verification.jwsRepresentation
          await transaction.finish()
          completion(.success(payload))
        case .userCancelled:
          completion(.success(["ok": false, "status": "cancelled"]))
        case .pending:
          completion(.success(["ok": false, "status": "pending"]))
        @unknown default:
          completion(.success(["ok": false, "status": "unknown"]))
        }
      } catch {
        completion(.failure(error))
      }
    }
  }

  func restore(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    Task {
      do {
        var rows: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
          let transaction = try Self.checkVerified(result)
          var row = Self.transactionPayload(transaction)
          row["signedTransactionInfo"] = result.jwsRepresentation
          rows.append(row)
        }
        completion(.success(["transactions": rows]))
      } catch {
        completion(.failure(error))
      }
    }
  }

  func showManageSubscriptions(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    Task { @MainActor in
      guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
        completion(.failure(EdgeStoreKitError.unavailable))
        return
      }
      do {
        try await AppStore.showManageSubscriptions(in: scene)
        completion(.success(["ok": true]))
      } catch {
        completion(.failure(error))
      }
    }
  }

  private static func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
    switch result {
    case .unverified:
      throw EdgeStoreKitError.unverifiedTransaction
    case .verified(let safe):
      return safe
    }
  }

  private static func transactionPayload(_ transaction: Transaction) -> [String: Any] {
    var row: [String: Any] = [
      "ok": true,
      "status": "purchased",
      "productId": transaction.productID,
      "productSlug": productIdToSlug[transaction.productID] ?? "",
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
    ]
    if let expiration = transaction.expirationDate {
      row["expiresAt"] = ISO8601DateFormatter().string(from: expiration)
    }
    if transaction.productID.hasSuffix(".annual") {
      row["priceInterval"] = "annual"
    } else if transaction.productID.hasSuffix(".monthly") {
      row["priceInterval"] = "monthly"
    }
    return row
  }
}

enum EdgeStoreKitError: LocalizedError {
  case productNotFound
  case unverifiedTransaction
  case unavailable

  var errorDescription: String? {
    switch self {
    case .productNotFound:
      return "App Store product not found."
    case .unverifiedTransaction:
      return "Could not verify App Store transaction."
    case .unavailable:
      return "In-app purchases require iOS 15 or later."
    }
  }
}
