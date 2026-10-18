import ExpoModulesCore
import MapKit
import UIKit

/// Cadrage demandé par le JS (cf. `src/mapSnapshot.ts`).
struct SnapshotOptions: Record {
  @Field var lat: Double = 0
  @Field var lon: Double = 0
  /// Largeur couverte au sol, en mètres.
  @Field var spanMeters: Double = 30000
  /// Taille de l'image en points (rendue en @2x).
  @Field var width: Double = 600
  @Field var height: Double = 400
  /// URI `file://` de destination (JPEG).
  @Field var uri: String = ""
}

/// Image d'une carte Apple Plans centrée sur un lieu, écrite dans un fichier.
/// Les tuiles viennent du service de cartes d'Apple (réseau requis au moment
/// de la création) ; l'image est ensuite gardée par l'app, l'album reste
/// exportable hors ligne.
public class ComclicMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ComclicMap")

    AsyncFunction("snapshot") { (o: SnapshotOptions, promise: Promise) in
      guard let url = URL(string: o.uri), url.isFileURL else {
        promise.reject("E_URI", "Destination invalide")
        return
      }
      let options = MKMapSnapshotter.Options()
      let center = CLLocationCoordinate2D(latitude: o.lat, longitude: o.lon)
      options.region = MKCoordinateRegion(
        center: center,
        latitudinalMeters: o.spanMeters * o.height / o.width,
        longitudinalMeters: o.spanMeters
      )
      options.size = CGSize(width: o.width, height: o.height)
      options.scale = 2
      options.mapType = .standard
      options.showsBuildings = false
      options.pointOfInterestFilter = .excludingAll
      // Toujours la carte claire : l'album s'imprime, le mode sombre de
      // l'iPhone ne doit pas s'y inviter.
      options.traitCollection = UITraitCollection(userInterfaceStyle: .light)

      let snapshotter = MKMapSnapshotter(options: options)
      snapshotter.start(with: DispatchQueue.global(qos: .userInitiated)) { snapshot, error in
        // Le snapshotter doit vivre jusqu'à la fin du rendu.
        _ = snapshotter
        guard let snapshot = snapshot,
              let data = snapshot.image.jpegData(compressionQuality: 0.85) else {
          promise.reject("E_SNAPSHOT", error?.localizedDescription ?? "Carte indisponible")
          return
        }
        do {
          try data.write(to: url, options: .atomic)
          promise.resolve(o.uri)
        } catch {
          promise.reject("E_WRITE", error.localizedDescription)
        }
      }
    }
  }
}
