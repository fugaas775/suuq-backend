"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/rebuild-closure.ts
require("reflect-metadata");
var data_source_1 = require("../src/data-source");
var category_entity_1 = require("../src/categories/entities/category.entity");
function rebuildCategoryClosureTable() {
    return __awaiter(this, void 0, void 0, function () {
        var categoryRepository, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Initializing data source...');
                    return [4 /*yield*/, data_source_1.AppDataSource.initialize()];
                case 1:
                    _a.sent();
                    console.log('Data source initialized successfully.');
                    categoryRepository = data_source_1.AppDataSource.getRepository(category_entity_1.Category);
                    console.log('Starting closure table rebuild for Category...');
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, 5, 7]);
                    return [4 /*yield*/, data_source_1.AppDataSource.transaction(function (transactionalEntityManager) { return __awaiter(_this, void 0, void 0, function () {
                            var queryRunner, closureTableName, allCategories, closureInserts, categoryMap, _i, allCategories_1, category, current;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        queryRunner = transactionalEntityManager.queryRunner;
                                        closureTableName = 'category_closure';
                                        // 1. Clear the closure table
                                        console.log("Truncating closure table \"".concat(closureTableName, "\"..."));
                                        // Use the raw table name directly in the query.
                                        return [4 /*yield*/, queryRunner.query("TRUNCATE TABLE \"".concat(closureTableName, "\" RESTART IDENTITY"))];
                                    case 1:
                                        // Use the raw table name directly in the query.
                                        _a.sent();
                                        return [4 /*yield*/, categoryRepository.find({ relations: ['parent'] })];
                                    case 2:
                                        allCategories = _a.sent();
                                        console.log("Found ".concat(allCategories.length, " categories to process."));
                                        if (allCategories.length === 0) {
                                            console.log('No categories found. Exiting.');
                                            return [2 /*return*/];
                                        }
                                        closureInserts = [];
                                        categoryMap = new Map(allCategories.map(function (c) { return [c.id, c]; }));
                                        for (_i = 0, allCategories_1 = allCategories; _i < allCategories_1.length; _i++) {
                                            category = allCategories_1[_i];
                                            current = category;
                                            while (current) {
                                                closureInserts.push({
                                                    id_ancestor: current.id,
                                                    id_descendant: category.id,
                                                });
                                                current = current.parent ? categoryMap.get(current.parent.id) : undefined;
                                            }
                                        }
                                        console.log("Generated ".concat(closureInserts.length, " closure relationships."));
                                        if (!(closureInserts.length > 0)) return [3 /*break*/, 4];
                                        console.log('Bulk inserting new closure relationships...');
                                        return [4 /*yield*/, transactionalEntityManager
                                                .createQueryBuilder()
                                                .insert()
                                                .into(closureTableName) // Use the hardcoded variable here as well
                                                .values(closureInserts)
                                                .execute()];
                                    case 3:
                                        _a.sent();
                                        _a.label = 4;
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); })];
                case 3:
                    _a.sent();
                    console.log('✅ Closure table rebuild completed successfully!');
                    return [3 /*break*/, 7];
                case 4:
                    error_1 = _a.sent();
                    console.error('❌ Failed to rebuild closure table:', error_1);
                    return [3 /*break*/, 7];
                case 5:
                    console.log('Destroying data source connection...');
                    return [4 /*yield*/, data_source_1.AppDataSource.destroy()];
                case 6:
                    _a.sent();
                    console.log('Connection destroyed.');
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
rebuildCategoryClosureTable();
