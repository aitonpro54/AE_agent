#pragma once
#include <cstddef>

namespace local_session::trusted_read::capture {
// Input and wrapper-log readers keep their existing defaults. Only actual
// retained getter-result bytes select this finite result profile explicitly.
constexpr std::size_t kOriginalResultBytes=1048576;
// A JSON array of one-byte scalars is the densest node representation. With
// B even bytes it holds at most B/2 nodes including its root; other containers,
// keys, strings and separators require at least as many bytes per node.
constexpr std::size_t kOriginalResultNodes=kOriginalResultBytes/2;
// PropertyDepth5 introduces an object and a children array per branch plus
// property/keyframe/value wrappers. Recursive layer parent/matte expansion can
// exceed this finite supported-result bound and must then refuse, never trim.
constexpr std::size_t kOriginalResultDepth=32;
}
