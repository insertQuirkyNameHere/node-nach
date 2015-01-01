// Batch

var _ = require('lodash');
var async = require('async');
var utils = require('./../utils');
var validate = require('./../validate');

var highLevelHeaderOverrides = ['serviceClassCode', 'companyDiscretionaryData', 'companyIdentification', 'standardEntryClassCode'];
var highLevelControlOverrides = ['addendaCount', 'entryHash', 'totalDebit', 'totalCredit'];

function Batch(options) {
	this._entries = [];

	// Allow the batch header/control defaults to be overriden if provided
	this.header = options.header ? _.merge(options.header, require('./header'), _.defaults) : _.cloneDeep(require('./header'));
	this.control = options.control ? _.merge(options.header, require('./control'), _.defaults) : _.cloneDeep(require('./control'));

	// Configure high-level overrides (these override the low-level settings if provided)
	utils.overrideLowLevel('header', highLevelHeaderOverrides, options, this);
	utils.overrideLowLevel('control', highLevelControlOverrides, options, this);

	// Validate the routing number (ABA) before slicing
	validate.validateRoutingNumber(options.originatingDFI);

	if(options.companyName) {
		this.header.companyName.value = options.companyName.toString().slice(0, this.header.companyName.width);
	}

	if(options.companyEntryDescription) {
		this.header.companyEntryDescription.value = options.companyEntryDescription.toString().slice(0, this.header.companyEntryDescription.width);
	}

	if(options.companyDescriptiveDate) {
		this.header.companyDescriptiveDate.value = options.companyDescriptiveDate.toString().slice(0, this.header.companyDescriptiveDate.width);
	}

	if(options.effectiveEntryDate) {
		this.header.effectiveEntryDate.value = utils.formatDate(options.effectiveEntryDate);
	}

	if(options.originatingDFI) {
		this.header.originatingDFI.value = options.originatingDFI.toString().slice(0, this.header.originatingDFI.width);
	}

	// Set control values which use the same header values
	this.control.serviceClassCode.value = this.header.serviceClassCode.value;
	this.control.companyIdentification.value = this.header.companyIdentification.value;
	this.control.originatingDFI.value = this.header.originatingDFI.value;

	// Perform validation on all the passed values
	this._validate();

	return this;
};

Batch.prototype._validate = function() {

	// Validate required fields have been passed
	validate.validateRequiredFields(this.header);

	// Validate the batch's ACH service class code
	validate.validateACHServiceClassCode(this.header.serviceClassCode.value);

	// Validate field lengths
	validate.validateLengths(this.header);

	// Validate datatypes
	validate.validateDataTypes(this.header);

	// Validate required fields have been passed
	validate.validateRequiredFields(this.control);
	
	// Validate field lengths
	validate.validateLengths(this.control);
	
	// Validate datatypes
	validate.validateDataTypes(this.control);
};

Batch.prototype.addEntry = function(entry) {
	
	// Increment the addendaCount of the batch
	++this.control.addendaCount.value;

	// Add the new entry to the entries array
	this._entries.push(entry);
};

Batch.prototype.generateHeader = function(cb) {	
	//this.header.batchNumber.value = 9
	//this.control.batchNumber.value = 9	
	utils.generateString(this.header, function(string) {
		cb(string);
	});
};

Batch.prototype.generateControl = function(cb) {
	var entryHash = 0;
	var totalDebit = 0;
	var totalCredit = 0;
	
	_.forEach(this._entries, function(entry) {
			entryHash += Number(entry.fields.receivingDFI.value);
//**** Should add handling for all transactions codes (22, 23, 24, 27, 28, 29, 32, 33, 34, 37, 38 & 39)
		if(entry.fields.transactionCode.value === '22' || entry.fields.transactionCode.value === '32') {
			totalCredit += Number(entry.fields.amount.value);
		} else if(entry.fields.transactionCode.value === '27' || entry.fields.transactionCode.value === '37') {
			// console.log("second" , entry.fields.amount.value);
			totalDebit += Number(entry.fields.amount.value);
		} else {
			console.log('transaction codes did not match or are not supported yet (unsupported status codes include: 23, 24, 28, 29, 33, 34, 38, 39)');
		}
	});
	
	this.control.totalCredit.value = totalCredit.toString().slice(0, 10);
	this.control.totalDebit.value = totalDebit.toString().slice(0, 10);
	
	// Add up the positions 4-11 and compute the total
	this.control.entryHash.value = entryHash.toString().slice(0, 10);

	utils.generateString(this.control, function(string) {
		cb(string);
	});
};

Batch.prototype.generateEntries = function(cb) {
	var result = '';

	async.each(this._entries, function(entry, done) {
		entry.generateString(function(string) {
			result += string + utils.newLineChar();
			done();
		});
	}, function(err) {
		cb(result);
	});
};

Batch.prototype.generateString = function(cb) {
	var self = this;

	self.generateHeader(function(headerString) {
		self.generateEntries(function(entryString) {
			self.generateControl(function(controlString) {
				cb(headerString + utils.newLineChar() + entryString  + controlString);
			});
		});
	});
};

Batch.prototype.get = function(field) {
	
	// If the header has the field, return the value
	if(this.header[field]) {
		return this.header[field]['value'];
	}
	
	// If the control has the field, return the value
	if(this.control[field]) {
		return this.control[field]['value'];
	}
};

Batch.prototype.set = function(field, value) {

	// If the header has the field, set the value
	if(this.header[field]) {
		this.header[field]['value'] = value;
	}

	// If the control has the field, set the value
	if(this.control[field]) {
		this.control[field]['value'] = value;
	}
};

module.exports = Batch;