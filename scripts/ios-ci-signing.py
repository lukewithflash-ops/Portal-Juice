#!/usr/bin/env python3
"""CI only: switch the App target's Release config to manual App Store signing
and stamp the version/build number. Debug stays on automatic signing."""
import re, sys

path, profile, build, version = sys.argv[1:5]
src = open(path).read()
m = re.search(r'(/\* Release \*/ = \{\s*isa = XCBuildConfiguration;\s*baseConfigurationReference = [^;]*Pods-App\.release\.xcconfig[^;]*;\s*buildSettings = \{)(.*?)(\};\s*name = Release;)', src, re.S)
if not m:
    sys.exit('App Release build configuration not found')
body = m.group(2)
body = re.sub(r'CODE_SIGN_STYLE = \w+;', 'CODE_SIGN_STYLE = Manual;', body)
body = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', body)
body = re.sub(r'MARKETING_VERSION = [^;]+;', f'MARKETING_VERSION = {version};', body)
body = body.rstrip() + (f'\n\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n'
         f'\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profile}";\n\t\t\t')
src = src[:m.start(2)] + body + src[m.end(2):]
open(path, 'w').write(src)
print('Release signing set to manual, build', build, 'version', version)
