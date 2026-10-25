# CI only: adds the ShareExtension target (app.portaljuice.share) to the App project and embeds it.
# Usage: ruby scripts/ios-add-share-extension.rb ios/App/App.xcodeproj BUILD VERSION TEAM "PROFILE NAME"
require 'xcodeproj'
path, build, version, team, profile = ARGV
proj = Xcodeproj::Project.open(path)
exit 0 if proj.targets.any? { |t| t.name == 'ShareExtension' }
app = proj.targets.find { |t| t.name == 'App' } or abort 'App target missing'
ext = proj.new_target(:app_extension, 'ShareExtension', :ios, '15.0', nil, :swift)
group = proj.main_group.new_group('ShareExtension', 'ShareExtension')
ext.add_file_references([group.new_file('ShareViewController.swift')])
group.new_file('Info.plist')
ext.build_configurations.each do |c|
  s = c.build_settings
  s['INFOPLIST_FILE'] = 'ShareExtension/Info.plist'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'app.portaljuice.share'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['DEVELOPMENT_TEAM'] = team
  s['CURRENT_PROJECT_VERSION'] = build
  s['MARKETING_VERSION'] = version
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'NO'
  s['SKIP_INSTALL'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  if c.name == 'Release'
    s['CODE_SIGN_STYLE'] = 'Manual'
    s['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
    s['PROVISIONING_PROFILE_SPECIFIER'] = profile
  else
    s['CODE_SIGN_STYLE'] = 'Automatic'
  end
end
app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(ext.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
proj.save
puts "ShareExtension added (build #{build}, version #{version})"
