Pod::Spec.new do |s|
  s.name           = 'ComclicMap'
  s.version        = '1.0.0'
  s.summary        = 'Images de carte Apple Plans pour les albums ComClic'
  s.description    = 'Module local : MKMapSnapshotter vers un fichier JPEG.'
  s.license        = 'UNLICENSED'
  s.author         = 'ComClic'
  s.homepage       = 'https://boccaraeric-jpg.github.io/photo-album-print/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = "**/*.{h,m,swift}"
end
