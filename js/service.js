'use strict';

var appServices = angular.module('ServiceModule', []);

appServices.factory('alertService', function($rootScope) {
	var alertService = {};

	// create an array of alerts available globally
	$rootScope.alerts = [];

	alertService.add = function(type, msg) {
		$rootScope.alerts.push({
			'type': type,
			'msg': msg,
			'close': function () {
				alertService.closeAlert(this);
			}
		});
	};

	alertService.closeAlert = function(index) {
		$rootScope.alerts.splice(index, 1);
	};

	return alertService;
});



// Share variable viewTab
appServices.service ( 'viewTab', function ( ) {
	return {};
});