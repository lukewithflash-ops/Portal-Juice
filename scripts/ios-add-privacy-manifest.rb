# Adds ios/App/App/PrivacyInfo.xcprivacy to the App target's Copy Bundle Resources. Idempotent.
# Usage: ruby scripts/ios-add-privacy-manifest.rb ios/App/App.xcodeproj   (gem install xcodeproj)
require 'xcodeproj'
proj = Xcodeproj::Project.open(ARGV[0] || 'ios/App/App.xcodeproj')
target = proj.targets.find { |t| t.name == 'App' } or abort 'App target not found'
group = proj.main_group.find_subpath('App', false) or abort 'App group not found'
ref = group.files.find { |f| f.path == 'PrivacyInfo.xcprivacy' } || group.new_reference('PrivacyInfo.xcprivacy')
unless target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref)
end
proj.save
puts 'PrivacyInfo.xcprivacy is in App > Copy Bundle Resources'
