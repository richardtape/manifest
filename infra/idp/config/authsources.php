<?php
// D6: the Manifest IdP serves TEST USERS ONLY and never authenticates a real
// person. Its signing key never touches a real identity, which is what keeps it
// off the top of §3.5's asset list.
$config = [
    'admin' => ['core:AdminPassword'],
    'manifest-test-users' => [
        'exampleauth:UserPass',
        // UBC sends OID, confirmed against staging and production (S2).
        'student:student' => [
            'urn:oid:1.3.6.1.4.1.60.1.1.1'  => ['stu000001'],   // ubcEduCwlPuid
            'urn:oid:0.9.2342.19200300.100.1.3' => ['student@student.ubc.ca'], // mail
            'urn:oid:2.5.4.42' => ['Test'],                     // givenName
            'urn:oid:2.5.4.4'  => ['Student'],                  // sn
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['student'],  // eduPersonAffiliation
        ],
        'instructor:instructor' => [
            'urn:oid:1.3.6.1.4.1.60.1.1.1'  => ['ins000001'],
            'urn:oid:0.9.2342.19200300.100.1.3' => ['instructor@ubc.ca'],
            'urn:oid:2.5.4.42' => ['Test'],
            'urn:oid:2.5.4.4'  => ['Instructor'],
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['faculty'],
        ],
    ],
];
