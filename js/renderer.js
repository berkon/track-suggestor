var config = require('configstore');
var pkg    = require('../package.json');
var fs     = require('fs'    );
var xml2js = require('xml2js');
var app    = require('electron').remote;
const { ipcRenderer } = require ('electron');
var pjson  = require('../package.json');
var dialog = app.dialog;

const conf = new config ( pkg.name, {
	"collection_nml"      : "",
	"recommendation_path" : "",
	"last_midi_in"        : "",
	"minimum_track_rating": "0",
	"track_filter"        : ""
	});

var g_xml_data = "";
var g_parser   = new xml2js.Parser();

angular.module('track_suggestor', [])

angular.module('track_suggestor').controller('suggestor', function ($rootScope, $scope) {
	$scope.collection_nml      = conf.get ("collection_nml"     );
	$scope.recommendation_path = conf.get ("recommendation_path");
	$scope.last_midi_in        = conf.get ("last_midi_in"       );
	$scope.minimum_track_rating= conf.get ("minimum_track_rating")
	$scope.track_filter        = conf.get ("track_filter"       )

	$scope.openSettings           = false
	$scope.midi_connected         = false;
	$scope.selected_midi_input    = null;
	$scope.cur_midi_input         = null;
	$scope.collection_loaded      = false;
	$scope.recommendation_written = false;
	$scope.deck_A_error           = false;
	$scope.deck_B_error           = false;
	$scope.sourceDeck             = null;
	$scope.hideSpinnerA           = false
	$scope.hideSpinnerB           = false
	$scope.errors  = []

	var UNKNOWN = -1;

	var num_of_tracks = UNKNOWN;
	var bpm_delta = 4;
	var UNDEFINED = -1;

	var g_midi   = null;

	var MSB_0 = UNDEFINED;
	var LSB_0 = UNDEFINED;
	var WAIT_LSB_0 = false
	var MSB_1 = UNDEFINED;
	var LSB_1 = UNDEFINED;
	var WAIT_LSB_1 = false

	var MIDI_CHAN_HC4500_DECK_A = 0x00;
	var MIDI_CHAN_HC4500_DECK_B = 0x01;

	var LINE_1_CHAR_1_MSB  = 0x01;
	var LINE_1_CHAR_2_MSB  = 0x02;
	var LINE_1_CHAR_3_MSB  = 0x03;
	var LINE_1_CHAR_4_MSB  = 0x04;
	var LINE_1_CHAR_5_MSB  = 0x05;
	var LINE_1_CHAR_6_MSB  = 0x07; // 0x06 is missing ... that's correct !!!
	var LINE_1_CHAR_7_MSB  = 0x08;
	var LINE_1_CHAR_8_MSB  = 0x09;
	var LINE_1_CHAR_9_MSB  = 0x0A;
	var LINE_1_CHAR_10_MSB = 0x0B;
	var LINE_1_CHAR_11_MSB = 0x0C;
	var LINE_1_CHAR_12_MSB = 0x0D;

	var LINE_1_CHAR_1_LSB  = 0x21;
	var LINE_1_CHAR_2_LSB  = 0x22;
	var LINE_1_CHAR_3_LSB  = 0x23;
	var LINE_1_CHAR_4_LSB  = 0x24;
	var LINE_1_CHAR_5_LSB  = 0x25;
	var LINE_1_CHAR_6_LSB  = 0x27; // 0x26 is missing ... that's correct !!!
	var LINE_1_CHAR_7_LSB  = 0x28;
	var LINE_1_CHAR_8_LSB  = 0x29;
	var LINE_1_CHAR_9_LSB  = 0x2A;
	var LINE_1_CHAR_10_LSB = 0x2B;
	var LINE_1_CHAR_11_LSB = 0x2C;
	var LINE_1_CHAR_12_LSB = 0x2D;

	var LINE_2_CHAR_1_MSB  = 0x0E;
	var LINE_2_CHAR_2_MSB  = 0x0F;
	var LINE_2_CHAR_3_MSB  = 0x10;
	var LINE_2_CHAR_4_MSB  = 0x11;
	var LINE_2_CHAR_5_MSB  = 0x12;
	var LINE_2_CHAR_6_MSB  = 0x13;
	var LINE_2_CHAR_7_MSB  = 0x14;
	var LINE_2_CHAR_8_MSB  = 0x15;
	var LINE_2_CHAR_9_MSB  = 0x16;
	var LINE_2_CHAR_10_MSB = 0x17;
	var LINE_2_CHAR_11_MSB = 0x18;
	var LINE_2_CHAR_12_MSB = 0x19;

	var LINE_2_CHAR_1_LSB  = 0x2E;
	var LINE_2_CHAR_2_LSB  = 0x2F;
	var LINE_2_CHAR_3_LSB  = 0x30;
	var LINE_2_CHAR_4_LSB  = 0x31;
	var LINE_2_CHAR_5_LSB  = 0x32;
	var LINE_2_CHAR_6_LSB  = 0x33;
	var LINE_2_CHAR_7_LSB  = 0x34;
	var LINE_2_CHAR_8_LSB  = 0x35;
	var LINE_2_CHAR_9_LSB  = 0x36;
	var LINE_2_CHAR_10_LSB = 0x37;
	var LINE_2_CHAR_11_LSB = 0x38;
	var LINE_2_CHAR_12_LSB = 0x39;

	var pos           		   = [ -1, -1, -1, -1 ]
	var last_pos      		   = [ -1, -1, -1, -1 ]
	var newCharOnPos11    	   = [ false, false, false, false ]
	var line_char_array        = [ [], [], [], [] ]
	var line_static_str        = [ '', '', '', '' ]
	var line_static_str_SHADOW = [ '', '', '', '' ]

	let log = ( str, type ) => {
		let now = new Date()
		let h  = now.getHours().toString()
		let m  = now.getMinutes().toString()
		let s  = now.getSeconds().toString()
		let ms = now.getMilliseconds().toString()

		while ( h.length  < 2 ) h  = '0' + h
		while ( m.length  < 2 ) m  = '0' + m
		while ( s.length  < 2 ) s  = '0' + s
		while ( ms.length < 3 ) ms = ms + '0'

		timeStr = h + ':' + m + ':' + s + ':' + ms

		switch ( type ) {
			case 'ERROR':
				console.error ( `${timeStr}  ${str}`)
				break

			case 'WARN':
			case 'INFO':
				console.warn ( `${timeStr}  ${str}`)
				break	

			case 'GREEN':
				console.log ( `%c${timeStr}  ${str}`, "background: green; color: white;")
				break

			default:
				console.log ( `${timeStr}  ${str}`)
		}
	}

	ipcRenderer.on ( 'OPEN_SETTINGS', (event, message) => {
		$scope.openSettings = true
		$scope.$apply()
	})

	// Identical characters following each other are not written by Traktors algorithm!!! Instead Traktor
	// obviously expects the controller to fill these spaces automatically up to the next, officially by
	// Traktor written position, with the same character.
	//
	// Will Survive
	// *
	//  *
	//   *
	// Notice this gap! The position for this "l" is not written by Traktor because it expects the controller to fill it with an "l"
	//     *
	//      *
	//       ......
	// BufferConditioner() performs this mechanism
	function BufferConditioner ( str, line_idx ) {
		if ( pos[line_idx] === 11 && !( str === '_' && str === line_char_array[line_idx][11]))
			newCharOnPos11[line_idx] = true

		line_char_array[line_idx][pos[line_idx]] = str

		if ( pos[line_idx] - last_pos[line_idx] > 1 && line_char_array[line_idx][last_pos[line_idx]] != "_" ) {
			while ( last_pos[line_idx] < pos[line_idx] - 1 ) {
				line_char_array[line_idx][last_pos[line_idx] + 1] = line_char_array[line_idx][last_pos[line_idx]]
				last_pos[line_idx]++
			}
		}
		else if ( pos[line_idx] < last_pos[line_idx] && last_pos[line_idx] < 11 && line_char_array[line_idx][last_pos[line_idx]] != "_") {
			while ( last_pos[line_idx] < 11 ) {
				line_char_array[line_idx][last_pos[line_idx] + 1] = line_char_array[line_idx][last_pos[line_idx]]
				last_pos[line_idx]++

				if ( last_pos[line_idx] == 11 )
					newCharOnPos11[line_idx] = true
			}

			if ( pos[line_idx] > 0 ) {
				last_pos[line_idx] = 0

				while ( last_pos[line_idx] < pos[line_idx] - 1 ) {
					line_char_array[line_idx][last_pos[line_idx] + 1] = line_char_array[line_idx][last_pos[line_idx]]
					last_pos[line_idx]++
				}
			}
		}

		last_pos[line_idx] = pos[line_idx]
	}

	function ExtractString ( line_idx ) {
		let startMarker = line_static_str_SHADOW[line_idx].indexOf    ("   ")
		let stopMarker  = line_static_str_SHADOW[line_idx].lastIndexOf("   ")
		let res         = null
		let startIdx    = -1
		let strLength   = 0

		if ( line_idx < 2 )
			isDeckA = true
		else
			isDeckA = false
		
		if ( line_idx === 0 || line_idx === 2)
			isFirstLine = true
		else
			isFirstLine = false

		if ( newCharOnPos11[line_idx] ) {
			line_static_str_SHADOW[line_idx] += line_char_array[line_idx][11]
			newCharOnPos11[line_idx] = false
		}

		if ( startMarker !== -1 ) { // Found start marker
			startIdx = startMarker + 3

			if ( stopMarker < startIdx + 1 )
				stopMarker = -1
			else
				strLength = stopMarker - startIdx

			if ( stopMarker === -1 ) { // No stop marker
				if ( line_static_str[line_idx] && line_static_str[line_idx].indexOf(line_static_str_SHADOW[line_idx].substr(startIdx).trim()) === -1 ) {
					isDeckA ? $scope.hideSpinnerA = false :	$scope.hideSpinnerB = false
					$scope.$apply()
				}
			} else { // Found stop marker
				if ( startMarker !== stopMarker ) { // Found valid string
					let tmpStr = line_static_str_SHADOW[line_idx].substr ( startIdx, strLength ).trim()

					if ( tmpStr === line_static_str[line_idx] ) {
						line_static_str_SHADOW[line_idx] = ""
						return
					}

					log ( "Line " + line_idx + " is differing! =========================")
					log ( "line_static_str_SHADOW: |" + line_static_str_SHADOW[line_idx] + "|" )
					log ( "tmpStr:                 |" + tmpStr + "|" )
					log ( "line_static_str:        |" + line_static_str[line_idx] + "|" )
					
					// Sometimes there are errors in MIDI transmission which causes unwanted characters to be inserted
					// This results in tracks being reloaded unintentionally. Thus, everytime there is a missmatch
					// we are checking whether this is a valid string by checking against the database
					if ( isFirstLine ) {
						if ( !CheckTrackName ( tmpStr ) ) {
							line_static_str_SHADOW[line_idx] = ""
							isDeckA ? $scope.hideSpinnerA = true : $scope.hideSpinnerB = true
							$scope.$apply()
							return
						}
					} else {
						if ( !CheckArtistName ( tmpStr ) ) {
							line_static_str_SHADOW[line_idx] = ""
							isDeckA ? $scope.hideSpinnerA = true : $scope.hideSpinnerB = true
							$scope.$apply()
							return
						}
					}

					line_static_str[line_idx] = tmpStr
					res = GetEntry ( line_static_str[isDeckA?0:2], line_static_str[isDeckA?1:3] )

					if ( typeof res === "string" ) {
						isDeckA ? $scope.deck_A_error = true : $scope.deck_B_error = true
						isDeckA ? $scope.deck_A = res : $scope.deck_B = res
						log ( `Deck ${isDeckA ? 'A' : 'B'}: ${line_static_str[isDeckA?line_idx:line_idx+2]}  -  ${line_static_str[isDeckA?line_idx+1:line_idx+3]} : ${res}` )
						isDeckA ? $scope.hideSpinnerA = true : $scope.hideSpinnerB = true
					} else if ( res && res.track && res.artist ) {
						isDeckA ? $scope.deck_A_error = false : $scope.deck_B_error = false
						isDeckA ? $scope.deck_A = res.track + "  -  " + res.artist : $scope.deck_B = res.track + "  -  " + res.artist
						$scope.sourceDeck = isDeckA ? 'A' :'B'
						log ( `Deck ${isDeckA ? 'A' : 'B'} : ${isDeckA ? $scope.deck_A : $scope.deck_B}`, 'GREEN' )
						log ( "LINE 0 ===========================================" + (line_idx===0 || line_idx===2 ? ' (just completed)' : '') )
						log ( "line_char_array:        |" + line_char_array       [isDeckA?0:2].join('') + "|" )
						log ( "line_static_str_SHADOW: |" + line_static_str_SHADOW[isDeckA?0:2] + "|" )
						log ( "line_static_str:        |" + line_static_str       [isDeckA?0:2] + "|" )
						log ( "LINE 1 ===========================================" + (line_idx===1 || line_idx===3 ? ' (just completed)' : '') )
						log ( "line_char_array:        |" + line_char_array       [isDeckA?1:3].join('') + "|" )
						log ( "line_static_str_SHADOW: |" + line_static_str_SHADOW[isDeckA?1:3] + "|" )
						log ( "line_static_str:        |" + line_static_str       [isDeckA?1:3] + "|" )
						CreatePlaylist ( res )
						isDeckA ? $scope.hideSpinnerA = true : $scope.hideSpinnerB = true
					}
					$scope.$apply()

					line_static_str_SHADOW[line_idx] = ""
				}
			}
		}
	}

	function escapeRegExp ( str ) {
		// $& = last matched character. In this case this means:
		// Replace the matched characters with: "\<matched char>"
		return str ? str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") : ''
	}

	// Check if Track name exists. This is a check to eleminate MIDI transmission errors
	function CheckTrackName ( track_pattern ) {
		let found = false
		num_of_tracks  = g_xml_data.NML.COLLECTION[0].ENTRY.length
		track_pattern = escapeRegExp ( track_pattern ) // Escape all special characters
		track_pattern = track_pattern.replace ( /_/g, ".*") // Replace underscores with a dot

		for ( var entry_idx = 0; entry_idx < num_of_tracks; entry_idx++) {
			let entry = g_xml_data.NML.COLLECTION[0].ENTRY[entry_idx]
			let track  = entry.$.TITLE

			if ( track && track.match("^"+track_pattern+"$") ) {
				found = true
				break
			}
		}

		if (!found)
			log ( "Not found: |" + track_pattern + '| ... ignoring!', 'ERROR' )

		return found ? true : false
	}

	// Check if Artist name exists. This is a check to eleminate MIDI transmission errors
	function CheckArtistName ( artist_pattern ) {
		let found = false
		num_of_tracks  = g_xml_data.NML.COLLECTION[0].ENTRY.length
		artist_pattern = escapeRegExp ( artist_pattern ) // Escape all special characters
		artist_pattern = artist_pattern.replace(/_/g, ".*") // Replace underscores with a dot

		for ( var entry_idx = 0; entry_idx < num_of_tracks; entry_idx++) {
			let entry = g_xml_data.NML.COLLECTION[0].ENTRY[entry_idx]
			let artist = entry.$.ARTIST

			if ( artist && artist.match("^"+artist_pattern+"$") ) {
				found = true
				break
			}
		}

		if (!found)
			log ( "Not found: |" + artist_pattern + '| ... ignoring!', 'ERROR' )

		return found ? true : false
	}

	//Replace underscores with correct special characters from XML object
	function GetEntry ( track_pattern, artist_pattern ) {
		num_of_tracks  = g_xml_data.NML.COLLECTION[0].ENTRY.length;

		track_pattern = escapeRegExp ( track_pattern ); // Escape all special characters
		track_pattern = track_pattern.replace ( /_/g, ".*"); // Replace underscores with a dot

		artist_pattern = escapeRegExp ( artist_pattern ); // Escape all special characters
		artist_pattern = artist_pattern.replace(/_/g, ".*"); // Replace underscores with a dot

		for ( var entry_idx = 0; entry_idx < num_of_tracks; entry_idx++) {
			var entry  = g_xml_data.NML.COLLECTION[0].ENTRY[entry_idx];
			var track  = entry.$.TITLE;
			var artist = entry.$.ARTIST;
			var genre  = entry.INFO[0].$.GENRE;
			var dir    = entry.LOCATION[0].$.DIR;
			var file   = entry.LOCATION[0].$.FILE;
			var volume = entry.LOCATION[0].$.VOLUME;
			var rating = parseInt ( entry.INFO[0].$.RANKING );

			// Only look at real tracks (no loops or one shots)
			if ( entry.hasOwnProperty ( "LOOPINFO" ) )
				continue;

			if ( track.match("^"+track_pattern+"$") && artist.match("^"+artist_pattern+"$") ) {
				if ( entry.hasOwnProperty ( "MUSICAL_KEY" ) )
					var key = parseInt ( entry.MUSICAL_KEY[0].$.VALUE );
				else
					return "<Track not mixable! Musical key is missing!>";

				if ( entry.hasOwnProperty ( "TEMPO" ) )
					var bpm = parseInt ( entry.TEMPO[0].$.BPM );
				else
					return "<Track not mixable! BPM is missing!>";

				if ( entry.hasOwnProperty ( "CUE_V2" ) ) {
					let beatmarker_found = false;

					entry.CUE_V2.some ( function ( cue ) {
						if ( cue.$.TYPE === "4" ) {
							beatmarker_found = true;
							return cue.$.TYPE === "4";
						}
					});

					if ( !beatmarker_found )
						return "<Track not mixable! Beat marker missing!>";
				} else
					return "<Track not mixable! Beat marker missing!>";

				return {
					"track" : track ,
					"artist": artist,
					"genre" : genre ,
					"dir"   : dir   ,
					"file"  : file  ,
					"volume": volume,
					"rating": rating,
					"key"   : key   ,
					"key_notation": KeyValue2KeyNotation(key) ,
					"bpm"   : bpm
				}
			}
		}
	}

	function KeyValue2KeyNotation ( val ) {
		/******************************************************************/
		/*  Notation:  1d  2d  3d  4d  5d  6d  7d  8d  9d  10d  11d  12d  */
		/*  Value   :  0   7   2   9   4   11  6   1   8   3    10   5    */
		/*----------------------------------------------------------------*/
		/*  Notation:  1m  2m  3m  4m  5m  6m  7m  8m  9m  10m  11m  12m  */
		/*  Value   :  21  16  23  18  13  20  15  22  17  12   19   14   */
		/******************************************************************/
		switch ( val ) {
			case 0 : return "1d" ;
			case 7 : return "2d" ;
			case 2 : return "3d" ;
			case 9 : return "4d" ;
			case 4 : return "5d" ;
			case 11: return "6d" ;
			case 6 : return "7d" ;
			case 1 : return "8d" ;
			case 8 : return "9d" ;
			case 3 : return "10d";
			case 10: return "11d";
			case 5 : return "12d";
			case 21: return "1m" ;
			case 16: return "2m" ;
			case 23: return "3m" ;
			case 18: return "4m" ;
			case 13: return "5m" ;
			case 20: return "6m" ;
			case 15: return "7m" ;
			case 22: return "8m" ;
			case 17: return "9m" ;
			case 12: return "10m";
			case 19: return "11m";
			case 14: return "12m";
			default: 
			  return "Invalid key value";
		}
	}

	function KeyNotation2KeyValue ( key ) {
		/******************************************************************/
		/*  Notation:  1d  2d  3d  4d  5d  6d  7d  8d  9d  10d  11d  12d  */
		/*  Value   :  0   7   2   9   4   11  6   1   8   3    10   5    Range: 0 - 11 */
		/*----------------------------------------------------------------*/
		/*  Notation:  1m  2m  3m  4m  5m  6m  7m  8m  9m  10m  11m  12m  */
		/*  Value   :  21  16  23  18  13  20  15  22  17  12   19   14   Range: 12 - 23*/
		/******************************************************************/
		switch ( key ) {
			case "1d" : return 0 ;
			case "2d" : return 7 ;
			case "3d" : return 2 ;
			case "4d" : return 9 ;
			case "5d" : return 4 ;
			case "6d" : return 11;
			case "7d" : return 6 ;
			case "8d" : return 1 ;
			case "9d" : return 8 ;
			case "10d": return 3 ;
			case "11d": return 10;
			case "12d": return 5 ;
			case "1m" : return 21;
			case "2m" : return 16;
			case "3m" : return 23;
			case "4m" : return 18;
			case "5m" : return 13;
			case "6m" : return 20;
			case "7m" : return 15;
			case "8m" : return 22;
			case "9m" : return 17;
			case "10m": return 12;
			case "11m": return 19;
			case "12m": return 14;
			default: 
			  return "Invalid key notation";
		}
	}

	function GetMatchingKeys ( cur_val, half_tone ) {
		var prev_val = UNKNOWN;
		var next_val = UNKNOWN;
		var mode     = UNKNOWN;
		var res      = null;

		if ( typeof half_tone !== 'undefined' && half_tone )
			var delta = 1; // Jump 1 halftone ... this means 7 steps in notation e.g. 2m => 9m
		else
			var delta = 7; // Jump 7 halftones ... this means 49 (7*7) steps which results in 1 step in notation e.g. 2m => 3m 

		if ( cur_val >= 0 && cur_val <= 11 ) { // Dur
			next_val = cur_val + delta;

			if ( next_val > 11 )
				next_val -= 12;

			prev_val = cur_val - delta;

			if ( prev_val < 0 )
				prev_val += 12;

			switch ( cur_val ) {
				case 0 : mode = 21; break; // 1d => 1m
				case 7 : mode = 16; break; // 2d => 2m
				case 2 : mode = 23; break; // 3d => 3m
				case 9 : mode = 18; break; // 4d => 4m
				case 4 : mode = 13; break; // 5d => 5m
				case 11: mode = 20; break; // 6d => 6m
				case 6 : mode = 15; break; // 7d => 7m
				case 1 : mode = 22; break; // 8d => 8m
				case 8 : mode = 17; break; // 9d => 9m
				case 3 : mode = 12; break; // 10d => 10m
				case 10: mode = 19; break; // 11d => 11m
				case 5 : mode = 14; break; // 12d => 12m
			}
		} else if ( cur_val >= 12 && cur_val <= 23 ) { // Moll
			next_val = cur_val + delta;

			if ( next_val > 23 )
				next_val -= 12;

			prev_val = cur_val - delta;

			if ( prev_val < 12 )
				prev_val += 12;

			switch ( cur_val ) {
				case 21 : mode = 0 ; break; // 1m  =>  1d 
				case 16 : mode = 7 ; break; // 2m  =>  2d 
				case 23 : mode = 2 ; break; // 3m  =>  3d 
				case 18 : mode = 9 ; break; // 4m  =>  4d 
				case 13 : mode = 4 ; break; // 5m  =>  5d 
				case 20 : mode = 11; break; // 6m  =>  6d 
				case 15 : mode = 6 ; break; // 7m  =>  7d 
				case 22 : mode = 1 ; break; // 8m  =>  8d 
				case 17 : mode = 8 ; break; // 9m  =>  9d 
				case 12 : mode = 3 ; break; // 10m => 10d
				case 19 : mode = 10; break; // 11m => 11d
				case 14 : mode = 5 ; break; // 12m => 12d
			}
		} else
			return "Invalid key value!";

		return {
			"next_val": next_val,
			"prev_val": prev_val,
			"mode"    : mode
		}
	}

	function EscapeHTML ( str ) {
		if ( str ) {
			str = str.replace(/&/g, "&amp;"); //Encode ampersand in HTML
			str = str.replace(/</g, "&lt;" ); //Encode '<' in HTML
			str = str.replace(/>/g, "&gt;" ); //Encode '>' in HTML
		}
		return str;
	}

	function CreatePlaylist ( entry2match, create_7_list ) {
		$scope.recommendation_written = false;
		var matching_tracks_arr = new Array();

		if ( typeof create_7_list === 'undefined' )
			var matching_keys = GetMatchingKeys ( entry2match.key );
		else
			var matching_keys = GetMatchingKeys ( entry2match.key, create_7_list );

		for ( var idx = 0; idx < num_of_tracks ; idx++ ) {
			var entry  = g_xml_data.NML.COLLECTION[0].ENTRY[idx];
			var track  = entry.$.TITLE;
			var artist = entry.$.ARTIST;
			var genre  = entry.INFO[0].$.GENRE;
			var label  = entry.INFO[0].$.LABEL;
			var dir    = entry.LOCATION[0].$.DIR;
			var file   = entry.LOCATION[0].$.FILE;
			var volume = entry.LOCATION[0].$.VOLUME;
			var rating = parseInt ( entry.INFO[0].$.RANKING );

			// Only look at real tracks (no loops or one shots)
			if ( entry.hasOwnProperty ( "LOOPINFO" ) )
				continue;

			if ( entry.hasOwnProperty ( "MUSICAL_KEY" ) )
				var key = parseInt ( entry.MUSICAL_KEY[0].$.VALUE );
			else
				continue;

			if ( entry.hasOwnProperty ( "TEMPO" ) )
				var bpm = parseInt ( entry.TEMPO[0].$.BPM );
			else
				continue;

			let filter_arr = $scope.track_filter.split(";")

			if ( ( bpm >= entry2match.bpm - bpm_delta && bpm <= entry2match.bpm + bpm_delta ) &&
			( key === entry2match.key || key === matching_keys.next_val || key === matching_keys.prev_val  || key === matching_keys.mode ) &&
			rating >= parseInt($scope.minimum_track_rating) &&
			track !== entry2match.track &&
			artist !== entry2match.artist ) {

				let isMatching = false

				for ( filter of filter_arr ) {
					col_name   = filter.split('=')[0]
					col_filter = filter.split('=')[1]

					if ( col_name && col_filter ) {
						const regex = new RegExp ( col_filter ) // '^G$' ... G only

						switch ( col_name ) {
							case 'TRACK' : isMatching = regex.test ( track  ); break
							case 'ARTIST': isMatching = regex.test ( artist ); break
							case 'GENRE' : isMatching = regex.test ( genre  );	break
							case 'LABEL' : isMatching = regex.test ( label  ); break
						}

						if ( !isMatching )
							break
					}
				}

				if ( !filter_arr.length || !filter_arr[0] )
					isMatching = true

				if ( isMatching && (typeof create_7_list === 'undefined' || !(key === entry2match.key || key === matching_keys.mode)) ) {
					matching_tracks_arr.push ({
						"track" : track ,
						"artist": artist,
						"genre" : genre ,
						"bpm"   : bpm   ,
						"key"   : key   ,
						"key_notation": KeyValue2KeyNotation(key) ,
						"dir"   : dir   ,
						"file"  : file  ,
						"volume": volume
					});
				}
			}
		}

		function compare(a,b) {
			if ( a.genre < b.genre )
				return -1;
			if ( a.genre > b.genre )
				return 1;
			return 0;
		}

		matching_tracks_arr.sort ( compare );

		// Push current running track first, so that is is shown on top
		if ( typeof create_7_list === 'undefined' ) {
			matching_tracks_arr.unshift ({
				"track" : entry2match.track ,
				"artist": entry2match.artist,
				"genre" : entry2match.genre ,
				"bpm"   : entry2match.bpm   ,
				"key"   : entry2match.key   ,
				"key_notation": entry2match.key_notation ,
				"dir"   : entry2match.dir   ,
				"file"  : entry2match.file  ,
				"volume": entry2match.volume
			});
		}

		var xml_str = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
		xml_str += '<NML VERSION="14"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>\n';
		xml_str += '<COLLECTION ENTRIES="' + matching_tracks_arr.length + '">\n';

		for ( var i = 0 ; i < matching_tracks_arr.length ; i++ ) {
			xml_str += '<ENTRY TITLE="'+EscapeHTML(matching_tracks_arr[i].track)+'" ARTIST="'+EscapeHTML(matching_tracks_arr[i].artist)+'"><LOCATION DIR="'+EscapeHTML(matching_tracks_arr[i].dir)+'" FILE="'+EscapeHTML(matching_tracks_arr[i].file)+'" VOLUME="'+matching_tracks_arr[i].volume+'" />\n';
			xml_str += '<INFO GENRE="'+EscapeHTML(matching_tracks_arr[i].genre)+'" />\n';
			xml_str += '<TEMPO BPM="'+matching_tracks_arr[i].bpm+'" BPM_QUALITY="100" />\n';
			xml_str += '<MUSICAL_KEY VALUE="'+matching_tracks_arr[i].key+'" />\n';
			xml_str += '</ENTRY>\n';
		}

		xml_str += '</COLLECTION>\n';
		xml_str += '<PLAYLISTS>\n';
		xml_str += '<NODE TYPE="FOLDER" NAME="$ROOT">\n';
		xml_str += '<SUBNODES COUNT="1"><NODE TYPE="PLAYLIST" NAME="RECOMMANDATIONS">\n';
		xml_str += '<PLAYLIST ENTRIES="' + matching_tracks_arr.length + '" TYPE="PROTOCOL">\n';

		for ( var i = 0 ; i < matching_tracks_arr.length ; i++ ) {
			xml_str += '<ENTRY>\n<PRIMARYKEY TYPE="TRACK" KEY="' + matching_tracks_arr[i].volume + EscapeHTML(matching_tracks_arr[i].dir) + EscapeHTML(matching_tracks_arr[i].file) + '"></PRIMARYKEY>\n</ENTRY>\n';
		}

		xml_str += '</PLAYLIST>\n';
		xml_str += '</NODE>\n';
		xml_str += '</SUBNODES>\n';
		xml_str += '</NODE>\n';
		xml_str += '</PLAYLISTS>\n';
		xml_str += '</NML>\n';

		if ( typeof $scope.recommendation_path !== 'undefined' && $scope.recommendation_path !== "" ) {
			if ( typeof create_7_list === 'undefined' ) {
				var path_and_filename = $scope.recommendation_path + "/Recommended.nml";
			} else {
				var path_and_filename = $scope.recommendation_path + "/Recommended_7.nml";
			}

			fs.writeFile ( path_and_filename, xml_str, function (err) {
				if ( err ) {
					alert("An error ocurred writing the file"+ err.message);
					log(err);
					$scope.recommendation_written = false;
					$scope.$apply();
					return;
				}

				$scope.recommendation_written = true;
				$scope.$apply();
			});
		}

		// Recurse once to create +7 / -7 (halftone up/down) list
		if ( typeof create_7_list === 'undefined' ) {
			$scope.matching_tracks_arr = matching_tracks_arr;
			CreatePlaylist ( entry2match, true );
		}
	}

	function midiMessageReceived( ev ) {
		var deck      = UNDEFINED;
		var midi_chan = ev.data[0] & 0x0f;
		var midi_cmd  = ev.data[1];
		var midi_val  = ev.data[2];
		var ch        = 0;
		var line      = UNDEFINED;
		var tmp_pos   = UNDEFINED;
		var str       = "";

		if ( !$scope.collection_loaded )
			return

		// HC-4500 sends data on channel 0x00 (for Deck A) and 0x01 (for Deck B).
		if      ( midi_chan == MIDI_CHAN_HC4500_DECK_A )
			deck = "A";
		else if ( midi_chan == MIDI_CHAN_HC4500_DECK_B )
			deck = "B";

		switch ( midi_cmd ) {
			// Display line 1
			case LINE_1_CHAR_1_MSB : line = 0; tmp_pos = 0; MSB_0 = midi_val; break;
			case LINE_1_CHAR_2_MSB : line = 0; tmp_pos = 1; MSB_0 = midi_val; break;
			case LINE_1_CHAR_3_MSB : line = 0; tmp_pos = 2; MSB_0 = midi_val; break;
			case LINE_1_CHAR_4_MSB : line = 0; tmp_pos = 3; MSB_0 = midi_val; break;
			case LINE_1_CHAR_5_MSB : line = 0; tmp_pos = 4; MSB_0 = midi_val; break;
			case LINE_1_CHAR_6_MSB : line = 0; tmp_pos = 5; MSB_0 = midi_val; break;
			case LINE_1_CHAR_7_MSB : line = 0; tmp_pos = 6; MSB_0 = midi_val; break;
			case LINE_1_CHAR_8_MSB : line = 0; tmp_pos = 7; MSB_0 = midi_val; break;
			case LINE_1_CHAR_9_MSB : line = 0; tmp_pos = 8; MSB_0 = midi_val; break;
			case LINE_1_CHAR_10_MSB: line = 0; tmp_pos = 9; MSB_0 = midi_val; break;
			case LINE_1_CHAR_11_MSB: line = 0; tmp_pos = 10;MSB_0 = midi_val; break;
			case LINE_1_CHAR_12_MSB: line = 0; tmp_pos = 11;MSB_0 = midi_val; break;

			case LINE_1_CHAR_1_LSB : line = 0; tmp_pos = 0; LSB_0 = midi_val; break;
			case LINE_1_CHAR_2_LSB : line = 0; tmp_pos = 1; LSB_0 = midi_val; break;
			case LINE_1_CHAR_3_LSB : line = 0; tmp_pos = 2; LSB_0 = midi_val; break;
			case LINE_1_CHAR_4_LSB : line = 0; tmp_pos = 3; LSB_0 = midi_val; break;
			case LINE_1_CHAR_5_LSB : line = 0; tmp_pos = 4; LSB_0 = midi_val; break;
			case LINE_1_CHAR_6_LSB : line = 0; tmp_pos = 5; LSB_0 = midi_val; break;
			case LINE_1_CHAR_7_LSB : line = 0; tmp_pos = 6; LSB_0 = midi_val; break;
			case LINE_1_CHAR_8_LSB : line = 0; tmp_pos = 7; LSB_0 = midi_val; break;
			case LINE_1_CHAR_9_LSB : line = 0; tmp_pos = 8; LSB_0 = midi_val; break;
			case LINE_1_CHAR_10_LSB: line = 0; tmp_pos = 9; LSB_0 = midi_val; break;
			case LINE_1_CHAR_11_LSB: line = 0; tmp_pos = 10;LSB_0 = midi_val; break;
			case LINE_1_CHAR_12_LSB: line = 0; tmp_pos = 11;LSB_0 = midi_val; break;

			// Display line 2
			case LINE_2_CHAR_1_MSB : line = 1; tmp_pos = 0; MSB_1 = midi_val; break;
			case LINE_2_CHAR_2_MSB : line = 1; tmp_pos = 1; MSB_1 = midi_val; break;
			case LINE_2_CHAR_3_MSB : line = 1; tmp_pos = 2; MSB_1 = midi_val; break;
			case LINE_2_CHAR_4_MSB : line = 1; tmp_pos = 3; MSB_1 = midi_val; break;
			case LINE_2_CHAR_5_MSB : line = 1; tmp_pos = 4; MSB_1 = midi_val; break;
			case LINE_2_CHAR_6_MSB : line = 1; tmp_pos = 5; MSB_1 = midi_val; break;
			case LINE_2_CHAR_7_MSB : line = 1; tmp_pos = 6; MSB_1 = midi_val; break;
			case LINE_2_CHAR_8_MSB : line = 1; tmp_pos = 7; MSB_1 = midi_val; break;
			case LINE_2_CHAR_9_MSB : line = 1; tmp_pos = 8; MSB_1 = midi_val; break;
			case LINE_2_CHAR_10_MSB: line = 1; tmp_pos = 9; MSB_1 = midi_val; break;
			case LINE_2_CHAR_11_MSB: line = 1; tmp_pos = 10;MSB_1 = midi_val; break;
			case LINE_2_CHAR_12_MSB: line = 1; tmp_pos = 11;MSB_1 = midi_val; break;

			case LINE_2_CHAR_1_LSB : line = 1; tmp_pos = 0; LSB_1 = midi_val; break;
			case LINE_2_CHAR_2_LSB : line = 1; tmp_pos = 1; LSB_1 = midi_val; break;
			case LINE_2_CHAR_3_LSB : line = 1; tmp_pos = 2; LSB_1 = midi_val; break;
			case LINE_2_CHAR_4_LSB : line = 1; tmp_pos = 3; LSB_1 = midi_val; break;
			case LINE_2_CHAR_5_LSB : line = 1; tmp_pos = 4; LSB_1 = midi_val; break;
			case LINE_2_CHAR_6_LSB : line = 1; tmp_pos = 5; LSB_1 = midi_val; break;
			case LINE_2_CHAR_7_LSB : line = 1; tmp_pos = 6; LSB_1 = midi_val; break;
			case LINE_2_CHAR_8_LSB : line = 1; tmp_pos = 7; LSB_1 = midi_val; break;
			case LINE_2_CHAR_9_LSB : line = 1; tmp_pos = 8; LSB_1 = midi_val; break;
			case LINE_2_CHAR_10_LSB: line = 1; tmp_pos = 9; LSB_1 = midi_val; break;
			case LINE_2_CHAR_11_LSB: line = 1; tmp_pos = 10;LSB_1 = midi_val; break;
			case LINE_2_CHAR_12_LSB: line = 1; tmp_pos = 11;LSB_1 = midi_val; break;

			default:
		}

		var char_complete = 0;

		// Check if LSB_0 received
		if ( MSB_0 != UNDEFINED && LSB_0 == UNDEFINED ) {
			if ( WAIT_LSB_0 ) {
				log ( `ERROR: LSB not received on  Deck: ${deck}  Line: 0!`, 'ERROR' )
				MSB_0 = UNDEFINED
				WAIT_LSB_0 = false
			}
			else
				WAIT_LSB_0 = true
		}

		// Check if MSB_0 received
		if ( MSB_0 == UNDEFINED && LSB_0 != UNDEFINED ) {
			log ( `ERROR: MSB not received on  Deck: ${deck}  Line: 0!`, 'ERROR' )
			LSB_0 = UNDEFINED
		}

		if ( MSB_0 != UNDEFINED && LSB_0 != UNDEFINED ) {
			ch = (MSB_0 << 4) | LSB_0;
			str = String.fromCharCode ( ch )
			MSB_0 = UNDEFINED
			LSB_0 = UNDEFINED
			WAIT_LSB_0 = false
			char_complete = 1
		}

		// Check if LSB_1 received
		if ( MSB_1 != UNDEFINED && LSB_1 == UNDEFINED ) {
			if ( WAIT_LSB_1 ) {
				log ( `ERROR: LSB not received on  Deck: ${deck}  Line: 1!`, 'ERROR' )
				MSB_1 = UNDEFINED
				WAIT_LSB_1 = false
			}
			else
				WAIT_LSB_1 = true
		}

		// Check if MSB_1 received
		if ( MSB_1 == UNDEFINED && LSB_1 != UNDEFINED ) {
			log ( `ERROR: MSB not received on  Deck: ${deck}  Line: 1!`, 'ERROR' )
			LSB_1 = UNDEFINED
		}

		if ( MSB_1 != UNDEFINED && LSB_1 != UNDEFINED ) {
			ch = (MSB_1 << 4) | LSB_1
			str = String.fromCharCode ( ch )
			MSB_1 = UNDEFINED
			LSB_1 = UNDEFINED
			WAIT_LSB_1 = false
			char_complete = 1
		}

		if ( char_complete == 0 )
			return

		if ( deck == "A" ) {
			if ( line == 0 ) {// Line 1
				pos[0] = tmp_pos;
				BufferConditioner ( str, 0 );
				ExtractString ( 0 );
			} else { // Line 2
				pos[1] = tmp_pos;
				BufferConditioner ( str, 1 );
				ExtractString ( 1 );
			}
		} else {
			if ( line == 0 ) { // Line 1
				pos[2] = tmp_pos;
				BufferConditioner ( str, 2 );
				ExtractString ( 2 );
			} else { // Line 2
				pos[3] = tmp_pos;
				BufferConditioner ( str, 3 );
				ExtractString ( 3 );
			}
		}
	}

	$scope.selectMIDIIn = function () {
		if ( !$scope.selected_midi_input )
			return

		if ( $scope.cur_midi_input ) {
			$scope.cur_midi_input.onmidimessage = null;
			$scope.cur_midi_input.close();
		}

		let newMidiIn = g_midi.inputs.get ( $scope.selected_midi_input.id )

		if ( newMidiIn ) {
			$scope.selected_midi_input = newMidiIn
			$scope.cur_midi_input      = newMidiIn
			$scope.selected_midi_input.onmidimessage = midiMessageReceived
			conf.set ( "last_midi_in", $scope.selected_midi_input.name )
			removeError ([ "ERR_NO_PORT" ])
		}
	}

	function populateMIDIInSelect() {
		var midi_inputs_iterator = g_midi.inputs.values()
		$scope.midi_inputs = []

		for ( let midi_input = midi_inputs_iterator.next(); midi_input && !midi_input.done; midi_input = midi_inputs_iterator.next()) {
			midi_input = midi_input.value  // midi_input.value contains an object with all the relevant details
			$scope.midi_inputs.push ( midi_input )

			if ( midi_input.name === $scope.last_midi_in ) {
				log ("Connecting to MIDI port: " + midi_input.name + "   ...")
				midi_input.onmidimessage = midiMessageReceived // This implicitely connects the port!
				$scope.selected_midi_input = midi_input
				$scope.cur_midi_input      = midi_input
			}
		}
		$scope.$apply()
		log ("Found MIDI inputs:")
		log ( $scope.midi_inputs )

		if ( !$scope.selected_midi_input ) {
			$scope.errors.push ({ id: "ERR_NO_PORT", msg: "ERROR: Please select MIDI port!"})
			$scope.openSettings = true
			$scope.$apply()
		}
	}

	function onMidiConnectionStateChange( e ) {
		log("State Changed for: " + e.port.name + " ("+e.port.type+")  State: " + e.port.state.toUpperCase() + "  Connection: " + e.port.connection.toUpperCase());
		if ( e.port.state.toUpperCase() === "CONNECTED" && e.port.connection.toUpperCase() === "OPEN" ) {
			$scope.midi_connected = true;
			$scope.$apply();
		}
	}

	function waitForMIDI ( midi ) {
		setTimeout ( function () { onMIDIStarted ( midi ); }, 500 );
	}

	function onMIDIStarted( midi ) {
		g_midi               = midi
		g_midi.onstatechange = onMidiConnectionStateChange
		populateMIDIInSelect()
	}

	function onMIDIError( err ) {
		$scope.errors.push ({ id: "ERR_MIDI_INIT", msg: "ERROR: MIDI not initialized:" + err.code })
		log( "ERROR: MIDI not initialized:" + err.code );
	}

	let removeError = function ( ids ) {
		for ( id of ids ) {
			let idx = $scope.errors.findIndex ( entry => entry.id === id )

			if ( idx != -1 )
				$scope.errors.splice ( idx, 1 )
		}

		$scope.$apply()
	}

	function ReadCollectionNML () {
		$scope.collection_loaded = false

		fs.readFile( $scope.collection_nml, function (err, data) {
			g_parser.parseString(data, function (err, xml) {
				if ( err ) {
					log ( "ERROR: Invalid XML file: " + err )
					$scope.errors.push ({ id: "ERR_INVALID_XML", msg: ("ERROR: Invalid XML file: " + err) })
					$scope.collection_loaded = false
					$scope.openSettings = true
					$scope.$apply()
					return
				}
				
				if ( xml && !xml.NML ) {
					log ( "ERROR: Invalid Traktor NML file!" )
					$scope.errors.push ({ id: "ERR_INVALID_NML", msg: "ERROR: Invalid Traktor NML file!" })
					$scope.collection_loaded = false
					$scope.openSettings = true
					$scope.$apply()
					return
				}

				log ("Collection loaded successfully!")
				$scope.collection_loaded = true
				g_xml_data = xml
				removeError ([ "ERR_INVALID_XML", "ERR_INVALID_NML", "ERR_NO_COLLECTION" ])
				$scope.$apply()
			})
		})
	}

	$scope.ChooseCollectionNml = function () {
		dialog.showOpenDialog ({
				title:"Open Traktor collection",
				defaultPath: $scope.collection_nml,
		})
		.then ( (file_arr) => {
			// fileNames is an array that contains all the selected
			if ( typeof file_arr === undefined || !file_arr.filePaths.length ) {
				log("No file selected");
			} else {
				$scope.collection_nml = file_arr.filePaths[0];
				$scope.$apply();
				conf.set ( "collection_nml", $scope.collection_nml );
				ReadCollectionNML()
			}
		});
	}

	$scope.ChooseRecommendationPath = function () {
		dialog.showOpenDialog ({
			title:"Select folder for recommendations",
			defaultPath: $scope.recommendation_path,
			properties: ["openDirectory"]
		})
		.then ( ( paths ) => {
			// folderPaths is an array that contains all the selected paths
			if ( paths.canceled ) {
				log ( "No folder selected!" )
				return
			} else {
				$scope.recommendation_path = paths.filePaths[0]
				$scope.$apply()
				conf.set ( "recommendation_path", $scope.recommendation_path )
				removeError ([ "ERR_NO_RECOMMEND_FOLDER" ])
			}
		});
	}
	
	$scope.openDonateWindow = function () {
		const { BrowserWindow } = require('electron').remote;
		let win = new BrowserWindow ({
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
				enableRemoteModule: true
			},
			width: 1220,
			height: 800
		})
		win.setMenuBarVisibility(false);
		win.loadURL("file://" + __dirname + "/donate.html");
	}

	$scope.getDeckColor = function ( deck ) {
		if ( (deck === 'A' && $scope.deck_A_error) || (deck === 'B' && $scope.deck_B_error) ) {
			return 'error-text-color'
		} else if ( $scope.sourceDeck === deck )
			return 'source-deck'
		else
			return 'deck-output-default-color'
	}

	$scope.setRating = function () {
		if ( !$scope.minimum_track_rating )
			$scope.minimum_track_rating = "0"

		conf.set ( "minimum_track_rating", $scope.minimum_track_rating )
	}

	$scope.saveFilter = function () {
		conf.set ( "track_filter", $scope.track_filter )
	}

	navigator.requestMIDIAccess().then ( waitForMIDI, onMIDIError )

	if ( !$scope.collection_nml ) {
		$scope.errors.push ({ id: "ERR_NO_COLLECTION", msg: "ERROR: Please select collection.nml first!" })
		log ( "ERROR: Please select collection.nml first!" )
		$scope.openSettings = true
	} else
		ReadCollectionNML()

	if ( !$scope.recommendation_path ) {
		$scope.errors.push ({ id: "ERR_NO_RECOMMEND_FOLDER", msg: "ERROR: Please select a folder to store recommendation playlists!" })
		log ( "ERROR: Please select a folder to store recommendation playlists!" )
		$scope.openSettings = true
	}
})