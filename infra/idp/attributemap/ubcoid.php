<?php
// The ONE attribute SimpleSAMLphp's own name2oid map cannot know: UBC's.
//
// core:AttributeMap loads maps by name from this directory and later maps win,
// so `['class' => 'core:AttributeMap', 'name2oid', 'ubcoid']` converts the four
// standard attributes with the library's own upgrade-tracked vocabulary and
// this file supplies only the UBC-specific one.
//
// urn:oid:1.3.6.1.4.1.60.6.1.6 is the OID passport-ubcshib's ATTRIBUTE_MAPPINGS
// carries, and S2 confirmed real UBC Shibboleth sends OID. P1 shipped
// 1.3.6.1.4.1.60.1.1.1, which matches nothing the library maps (measured
// 2026-09-07), so `ubcEduCwlPuid` was simply absent and the strategy threw
// `Missing ubcEduCwlPuid attribute`.
$attributemap = [
    'ubcEduCwlPuid' => 'urn:oid:1.3.6.1.4.1.60.6.1.6',
];
